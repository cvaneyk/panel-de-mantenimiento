<?php
/**
 * Plugin Name: Panel de mantenimiento — agente
 * Description: Expone el estado de esta web al panel de mantenimiento. Solo lectura: no modifica nada.
 * Version: 1.0.0
 *
 * Instalación: copiar este archivo a wp-content/mu-plugins/ y añadir a
 * wp-config.php la clave que genera el panel para esta web:
 *
 *     define( 'PANEL_AGENT_KEY', 'la-clave-que-muestra-el-panel' );
 *
 * Regla de este archivo (§3 del SPEC, regla 6 del CLAUDE.md): SOLO LECTURA.
 * Ninguna ruta escribe, y tampoco se fuerza una comprobación de
 * actualizaciones (wp_update_plugins() y similares escriben transients): se lee
 * la última que hizo WordPress por su cuenta y se devuelve su fecha.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PANEL_AGENT_VERSION = '1.0.0';

add_action(
	'rest_api_init',
	static function () {
		register_rest_route(
			'panel/v1',
			'/status',
			array(
				'methods'             => 'GET',
				'callback'            => 'panel_agent_status',
				'permission_callback' => 'panel_agent_authorize',
			)
		);
	}
);

function panel_agent_authorize( WP_REST_Request $request ) {
	if ( ! defined( 'PANEL_AGENT_KEY' ) || ! is_string( PANEL_AGENT_KEY ) || strlen( PANEL_AGENT_KEY ) < 32 ) {
		return new WP_Error( 'panel_agent_not_configured', 'Agente sin clave configurada.', array( 'status' => 503 ) );
	}

	$provided = (string) $request->get_header( 'x_panel_key' );

	if ( '' === $provided || ! hash_equals( PANEL_AGENT_KEY, $provided ) ) {
		return new WP_Error( 'panel_agent_forbidden', 'Clave no válida.', array( 'status' => 403 ) );
	}

	return true;
}

function panel_agent_status() {
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}

	$plugin_updates = get_site_transient( 'update_plugins' );
	$theme_updates  = get_site_transient( 'update_themes' );
	$core_updates   = get_site_transient( 'update_core' );

	$plugins = array();
	foreach ( get_plugins() as $file => $data ) {
		$update = null;
		if ( is_object( $plugin_updates ) && isset( $plugin_updates->response[ $file ]->new_version ) ) {
			$update = (string) $plugin_updates->response[ $file ]->new_version;
		}
		$plugins[] = array(
			'slug'             => dirname( $file ) === '.' ? basename( $file, '.php' ) : dirname( $file ),
			'name'             => $data['Name'],
			'version'          => $data['Version'],
			'active'           => is_plugin_active( $file ),
			'update_available' => $update,
		);
	}

	$active_stylesheet = get_stylesheet();
	$active_template   = get_template();
	$themes            = array();
	foreach ( wp_get_themes() as $stylesheet => $theme ) {
		$update = null;
		if ( is_object( $theme_updates ) && isset( $theme_updates->response[ $stylesheet ]['new_version'] ) ) {
			$update = (string) $theme_updates->response[ $stylesheet ]['new_version'];
		}
		$themes[] = array(
			'slug'             => $stylesheet,
			'name'             => $theme->get( 'Name' ),
			'version'          => $theme->get( 'Version' ),
			// Un tema padre también está en uso si el activo es su hijo.
			'active'           => $stylesheet === $active_stylesheet || $stylesheet === $active_template,
			'update_available' => $update,
		);
	}

	$core_update = null;
	if ( is_object( $core_updates ) && ! empty( $core_updates->updates ) ) {
		foreach ( $core_updates->updates as $offer ) {
			if ( isset( $offer->response ) && 'upgrade' === $offer->response ) {
				$core_update = (string) $offer->current;
				break;
			}
		}
	}

	$updates_pending = count( array_filter( array_column( $plugins, 'update_available' ) ) )
		+ count( array_filter( array_column( $themes, 'update_available' ) ) )
		+ ( null === $core_update ? 0 : 1 );

	$backup = panel_agent_last_backup();

	$response = new WP_REST_Response(
		array(
			'agent_version'              => PANEL_AGENT_VERSION,
			'wp_version'                 => get_bloginfo( 'version' ),
			'php_version'                => PHP_VERSION,
			'core_update_available'      => $core_update,
			'plugins'                    => $plugins,
			'themes'                     => $themes,
			'updates_pending'            => $updates_pending,
			'updates_checked_at'         => panel_agent_updates_checked_at( array( $plugin_updates, $theme_updates, $core_updates ) ),
			'admin_count'                => count( get_users( array( 'role' => 'administrator', 'fields' => 'ID' ) ) ),
			'debug_enabled'              => defined( 'WP_DEBUG' ) && WP_DEBUG,
			'search_engines_discouraged' => '0' === (string) get_option( 'blog_public' ),
			'db_size_mb'                 => panel_agent_db_size_mb(),
			'db_revisions'               => panel_agent_db_revisions(),
			'db_expired_transients'      => panel_agent_db_expired_transients(),
			'db_autoload_kb'             => panel_agent_db_autoload_kb(),
			'last_backup_at'             => $backup ? gmdate( 'c', $backup['time'] ) : null,
			'backup_source'              => $backup ? $backup['source'] : null,
		)
	);
	$response->header( 'Cache-Control', 'no-store' );

	return $response;
}

// La comprobación más antigua de las tres: es la fecha a partir de la cual el
// dato de "actualizaciones pendientes" puede estar desfasado.
function panel_agent_updates_checked_at( array $transients ) {
	$oldest = null;
	foreach ( $transients as $transient ) {
		if ( ! is_object( $transient ) || empty( $transient->last_checked ) ) {
			return null;
		}
		$oldest = null === $oldest ? (int) $transient->last_checked : min( $oldest, (int) $transient->last_checked );
	}
	return null === $oldest ? null : gmdate( 'c', $oldest );
}

function panel_agent_db_size_mb() {
	global $wpdb;
	$bytes = $wpdb->get_var(
		$wpdb->prepare(
			'SELECT SUM(data_length + index_length) FROM information_schema.TABLES WHERE table_schema = %s',
			DB_NAME
		)
	);
	return null === $bytes ? null : (int) round( $bytes / 1048576 );
}

function panel_agent_db_revisions() {
	global $wpdb;
	return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'revision'" );
}

function panel_agent_db_expired_transients() {
	global $wpdb;
	return (int) $wpdb->get_var(
		$wpdb->prepare(
			"SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s AND option_value < %d",
			$wpdb->esc_like( '_transient_timeout_' ) . '%',
			time()
		)
	);
}

function panel_agent_db_autoload_kb() {
	global $wpdb;
	// WordPress 6.6 cambió los valores de autoload ('on', 'auto-on', 'auto');
	// antes solo existía 'yes'.
	$values       = function_exists( 'wp_autoload_values_to_autoload' ) ? wp_autoload_values_to_autoload() : array( 'yes' );
	$placeholders = implode( ',', array_fill( 0, count( $values ), '%s' ) );
	$bytes        = $wpdb->get_var(
		$wpdb->prepare(
			"SELECT SUM(LENGTH(option_value)) FROM {$wpdb->options} WHERE autoload IN ($placeholders)", // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders
			$values
		)
	);
	return null === $bytes ? null : (int) round( $bytes / 1024 );
}

// Rastro del último backup de UpdraftPlus, Duplicator o All-in-One WP
// Migration. Si no hay rastro, null: el panel lo muestra como "sin
// monitorizar", nunca como "sin backup" (§3 del SPEC).
function panel_agent_last_backup() {
	$candidates = array();

	$updraft = get_option( 'updraft_last_backup' );
	if ( is_array( $updraft ) && ! empty( $updraft['backup_time'] ) ) {
		$candidates[] = array( 'time' => (int) $updraft['backup_time'], 'source' => 'updraftplus' );
	}

	$patterns = array(
		'updraftplus'             => WP_CONTENT_DIR . '/updraft/backup_*',
		'duplicator'              => WP_CONTENT_DIR . '/backups-dup-{lite,pro}/*.{zip,daf}',
		'all-in-one-wp-migration' => WP_CONTENT_DIR . '/ai1wm-backups/*.wpress',
	);
	foreach ( $patterns as $source => $pattern ) {
		$files = glob( $pattern, defined( 'GLOB_BRACE' ) ? GLOB_BRACE : 0 );
		foreach ( $files ? $files : array() as $file ) {
			$mtime = @filemtime( $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			if ( $mtime ) {
				$candidates[] = array( 'time' => $mtime, 'source' => $source );
			}
		}
	}

	if ( ! $candidates ) {
		return null;
	}

	usort(
		$candidates,
		static function ( $a, $b ) {
			return $b['time'] - $a['time'];
		}
	);
	return $candidates[0];
}
