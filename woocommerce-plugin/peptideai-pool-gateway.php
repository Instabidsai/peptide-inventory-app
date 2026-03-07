<?php
/**
 * Plugin Name: PeptideAI Pool Gateway
 * Description: Accept credit cards with USDC pool settlement via NMI Collect.js
 * Version: 1.0.0
 * Author: PeptideAI
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.8
 * WC tested up to: 9.0
 */
defined('ABSPATH') || exit;

define('PEPTIDEAI_POOL_VERSION', '1.0.0');
define('PEPTIDEAI_POOL_PATH', plugin_dir_path(__FILE__));
define('PEPTIDEAI_POOL_URL', plugin_dir_url(__FILE__));

add_action('plugins_loaded', function() {
    if (!class_exists('WC_Payment_Gateway')) return;
    require_once PEPTIDEAI_POOL_PATH . 'includes/class-pool-gateway.php';
    require_once PEPTIDEAI_POOL_PATH . 'includes/class-pool-webhook.php';
    add_filter('woocommerce_payment_gateways', function($gateways) {
        $gateways[] = 'WC_PeptideAI_Pool_Gateway';
        return $gateways;
    });
}, 11);

// Enqueue checkout assets
add_action('wp_enqueue_scripts', function() {
    if (!is_checkout()) return;
    $gateway = new WC_PeptideAI_Pool_Gateway();
    if ($gateway->enabled !== 'yes') return;

    $tok_key = $gateway->get_option('nmi_tokenization_key');
    if ($tok_key) {
        wp_enqueue_script('nmi-collectjs', 'https://secure.nmi.com/token/Collect.js', [], null, true);
        // Collect.js needs the tokenization key as a data attribute on its script tag
        add_filter('script_loader_tag', function($tag, $handle) use ($tok_key) {
            if ($handle === 'nmi-collectjs') {
                $tag = str_replace(' src', ' data-tokenization-key="' . esc_attr($tok_key) . '" src', $tag);
            }
            return $tag;
        }, 10, 2);
    }

    wp_enqueue_script('peptideai-checkout', PEPTIDEAI_POOL_URL . 'assets/js/checkout.js', ['jquery', 'nmi-collectjs'], PEPTIDEAI_POOL_VERSION, true);
    wp_enqueue_style('peptideai-checkout', PEPTIDEAI_POOL_URL . 'assets/css/checkout.css', [], PEPTIDEAI_POOL_VERSION);
});
