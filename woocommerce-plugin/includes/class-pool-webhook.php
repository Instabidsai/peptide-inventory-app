<?php
defined('ABSPATH') || exit;

class WC_PeptideAI_Pool_Webhook {
    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes() {
        register_rest_route('peptideai-pool/v1', '/settlement', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_settlement'],
            'permission_callback' => [$this, 'verify_api_key'],
        ]);
    }

    public function verify_api_key($request) {
        $gateway = new WC_PeptideAI_Pool_Gateway();
        $expected = $gateway->get_option('peptideai_api_key');
        $provided = $request->get_header('Authorization');
        if ($provided) $provided = str_replace('Bearer ', '', $provided);
        if (!$provided) $provided = $request->get_header('X-PeptideAI-Key');
        return $provided && hash_equals($expected, $provided);
    }

    public function handle_settlement($request) {
        $order_id = absint($request->get_param('order_id'));
        $status = sanitize_text_field($request->get_param('status'));
        $tx_hash = sanitize_text_field($request->get_param('tx_hash'));

        $order = wc_get_order($order_id);
        if (!$order) return new WP_REST_Response(['error' => 'Order not found'], 404);
        if ($order->get_payment_method() !== 'peptideai_pool_gateway') return new WP_REST_Response(['error' => 'Wrong gateway'], 400);

        if ($status === 'settled') {
            $nmi_tx_id = $order->get_meta('_nmi_transaction_id');
            if ($nmi_tx_id) $this->nmi_capture($nmi_tx_id);

            $order->update_meta_data('_peptideai_tx_status', 'settled');
            if ($tx_hash) $order->update_meta_data('_peptideai_usdc_tx_hash', $tx_hash);
            $order->update_meta_data('_peptideai_settled_at', current_time('mysql'));
            $order->save();
            $order->payment_complete($nmi_tx_id);
            $order->add_order_note('USDC settlement confirmed. TX: ' . ($tx_hash ?: 'N/A'));
        } elseif ($status === 'failed') {
            $error = sanitize_text_field($request->get_param('error_message'));
            $order->update_meta_data('_peptideai_tx_status', 'failed');
            $order->save();
            $order->update_status('failed', 'Pool release failed: ' . ($error ?: 'Unknown error'));
        }

        return new WP_REST_Response(['success' => true], 200);
    }

    private function nmi_capture($transaction_id) {
        $gateway = new WC_PeptideAI_Pool_Gateway();
        wp_remote_post('https://secure.nmi.com/api/transact.php', [
            'body' => [
                'security_key' => $gateway->get_option('nmi_security_key'),
                'type' => 'capture',
                'transactionid' => $transaction_id,
            ],
            'timeout' => 15,
        ]);
    }
}

new WC_PeptideAI_Pool_Webhook();
