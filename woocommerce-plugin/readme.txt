=== PeptideAI Pool Gateway ===
Contributors: peptideai
Tags: woocommerce, payment, usdc, crypto, nmi
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
WC requires at least: 5.8
WC tested up to: 9.0
Stable tag: 1.0.0
License: GPLv2

Accept credit cards with USDC pool settlement via NMI Collect.js.

== Description ==

PeptideAI Pool Gateway enables WooCommerce merchants to accept credit card payments settled through a USDC liquidity pool. Customers see a standard credit card form — no crypto knowledge required.

**How it works:**
1. Customer enters card details (NMI Collect.js iframes — PCI SAQ-A compliant)
2. Card is authorized via NMI Direct Connect API
3. PeptideAI signs a USDC release from the merchant's pool
4. Order is confirmed (~5 seconds total)

**Requirements:**
- WooCommerce 5.8+
- NMI merchant account with Collect.js enabled
- PeptideAI account with deployed USDC pool contract

== Installation ==

1. Upload the plugin folder to /wp-content/plugins/
2. Activate via Plugins menu
3. Go to WooCommerce > Settings > Payments > PeptideAI Pool Gateway
4. Enter your NMI and PeptideAI credentials
5. Enable the gateway

== Changelog ==

= 1.0.0 =
* Initial release
