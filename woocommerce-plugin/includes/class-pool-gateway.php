<?php
defined('ABSPATH') || exit;

class WC_PeptideAI_Pool_Gateway extends WC_Payment_Gateway {
    public function __construct() {
        $this->id = 'peptideai_pool_gateway';
        $this->method_title = 'PeptideAI Pool Gateway';
        $this->method_description = 'Accept credit cards with USDC pool settlement';
        $this->has_fields = true;
        $this->supports = ['products'];

        $this->init_form_fields();
        $this->init_settings();

        $this->title = $this->get_option('title', 'Credit Card');
        $this->description = $this->get_option('description', 'Pay securely with your credit card.');
        $this->enabled = $this->get_option('enabled', 'no');

        add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
    }

    public function init_form_fields() {
        $this->form_fields = [
            'enabled' => ['title' => 'Enable/Disable', 'type' => 'checkbox', 'label' => 'Enable PeptideAI Pool Gateway', 'default' => 'no'],
            'title' => ['title' => 'Title', 'type' => 'text', 'default' => 'Credit Card'],
            'description' => ['title' => 'Description', 'type' => 'textarea', 'default' => 'Pay securely with your credit card.'],
            'testmode' => ['title' => 'Test Mode', 'type' => 'checkbox', 'label' => 'Enable test mode', 'default' => 'yes'],
            'peptideai_api_url' => ['title' => 'PeptideAI API URL', 'type' => 'text', 'description' => 'Supabase functions URL', 'placeholder' => 'https://xxx.supabase.co'],
            'peptideai_api_key' => ['title' => 'PeptideAI API Key', 'type' => 'password', 'description' => 'Bearer token for edge functions'],
            'nmi_tokenization_key' => ['title' => 'NMI Tokenization Key', 'type' => 'text', 'description' => 'Public key for Collect.js (safe for frontend)'],
            'nmi_security_key' => ['title' => 'NMI Security Key', 'type' => 'password', 'description' => 'Server-side API key for Direct Connect'],
            'pool_contract_address' => ['title' => 'Pool Contract Address', 'type' => 'text', 'placeholder' => '0x...'],
            'chain' => ['title' => 'Blockchain', 'type' => 'select', 'options' => ['base' => 'Base', 'polygon' => 'Polygon', 'base_sepolia' => 'Base Sepolia (Test)'], 'default' => 'base'],
            'merchant_wallet' => ['title' => 'Merchant Wallet', 'type' => 'text', 'placeholder' => '0x...'],
        ];
    }

    public function payment_fields() {
        if ($this->description) echo '<p>' . esc_html($this->description) . '</p>';
        ?>
        <div class="peptideai-card-form" id="peptideai-card-form">
            <div class="peptideai-field-row">
                <label>Card Number</label>
                <div id="peptideai-ccnumber" class="peptideai-collect-field"></div>
            </div>
            <div class="peptideai-field-row peptideai-field-row--half">
                <div>
                    <label>Expiry</label>
                    <div id="peptideai-ccexp" class="peptideai-collect-field"></div>
                </div>
                <div>
                    <label>CVV</label>
                    <div id="peptideai-cvv" class="peptideai-collect-field"></div>
                </div>
            </div>
            <input type="hidden" name="payment_token" id="peptideai-token" value="" />
            <div id="peptideai-errors" class="peptideai-errors" style="display:none;"></div>
        </div>
        <?php
    }

    public function validate_fields() {
        if (empty($_POST['payment_token'])) {
            wc_add_notice('Please enter your card details.', 'error');
            return false;
        }
        return true;
    }

    public function process_payment($order_id) {
        $order = wc_get_order($order_id);
        $token = sanitize_text_field($_POST['payment_token']);

        // Step 1: Authorize card via NMI
        $nmi_result = $this->nmi_authorize($order, $token);
        if (!$nmi_result['success']) {
            wc_add_notice('Payment failed: ' . $nmi_result['error'], 'error');
            return;
        }

        // Step 2: Request pool release signature from PeptideAI
        $sign_result = $this->peptideai_sign_release($order);
        if (!$sign_result['success']) {
            // Void the NMI auth since pool signing failed
            $this->nmi_void($nmi_result['transaction_id']);
            wc_add_notice('Payment processing failed. Your card was not charged.', 'error');
            return;
        }

        // Step 3: Store metadata
        $order->update_meta_data('_nmi_transaction_id', $nmi_result['transaction_id']);
        $order->update_meta_data('_nmi_auth_code', $nmi_result['auth_code']);
        $order->update_meta_data('_peptideai_signature', $sign_result['signature']);
        $order->update_meta_data('_peptideai_order_hash', $sign_result['order_hash']);
        $order->update_meta_data('_peptideai_tx_status', 'pending');
        $order->save();

        // Step 4: Mark as on-hold (will be completed when USDC settles)
        $order->update_status('on-hold', 'Card authorized. USDC release pending.');

        return ['result' => 'success', 'redirect' => $this->get_return_url($order)];
    }

    private function nmi_authorize($order, $token) {
        $args = [
            'security_key' => $this->get_option('nmi_security_key'),
            'type' => 'auth',
            'payment_token' => $token,
            'amount' => $order->get_total(),
            'firstname' => $order->get_billing_first_name(),
            'lastname' => $order->get_billing_last_name(),
            'email' => $order->get_billing_email(),
            'address1' => $order->get_billing_address_1(),
            'city' => $order->get_billing_city(),
            'state' => $order->get_billing_state(),
            'zip' => $order->get_billing_postcode(),
            'country' => $order->get_billing_country(),
            'orderid' => (string) $order->get_id(),
        ];

        $response = wp_remote_post('https://secure.nmi.com/api/transact.php', [
            'body' => $args,
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        parse_str(wp_remote_retrieve_body($response), $result);

        if (isset($result['response']) && $result['response'] == '1') {
            return ['success' => true, 'transaction_id' => $result['transactionid'] ?? '', 'auth_code' => $result['authcode'] ?? ''];
        }

        return ['success' => false, 'error' => $result['responsetext'] ?? 'Card declined'];
    }

    private function nmi_void($transaction_id) {
        wp_remote_post('https://secure.nmi.com/api/transact.php', [
            'body' => [
                'security_key' => $this->get_option('nmi_security_key'),
                'type' => 'void',
                'transactionid' => $transaction_id,
            ],
            'timeout' => 15,
        ]);
    }

    private function peptideai_sign_release($order) {
        $api_url = rtrim($this->get_option('peptideai_api_url'), '/');
        $api_key = $this->get_option('peptideai_api_key');

        $response = wp_remote_post($api_url . '/functions/v1/pool-sign-release', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $api_key,
            ],
            'body' => wp_json_encode([
                'order_id' => (string) $order->get_id(),
                'amount' => (float) $order->get_total(),
                'recipient' => $this->get_option('pool_contract_address'),
            ]),
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        $code = wp_remote_retrieve_response_code($response);

        if ($code !== 200 || empty($body['signature'])) {
            return ['success' => false, 'error' => $body['error'] ?? 'Pool signing failed'];
        }

        return ['success' => true, 'signature' => $body['signature'], 'order_hash' => $body['order_hash'] ?? ''];
    }
}
