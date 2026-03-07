jQuery(function($) {
    if (typeof CollectJS === 'undefined') return;

    var tokenRequestPending = false;

    CollectJS.configure({
        variant: 'inline',
        styleSniffer: true,
        fields: {
            ccnumber: { selector: '#peptideai-ccnumber', placeholder: 'Card Number' },
            ccexp: { selector: '#peptideai-ccexp', placeholder: 'MM / YY' },
            cvv: { selector: '#peptideai-cvv', placeholder: 'CVV' }
        },
        callback: function(response) {
            tokenRequestPending = false;
            document.getElementById('peptideai-token').value = response.token;
            clearErrors();
            $('form.checkout').submit();
        },
        validationCallback: function(field, status, message) {
            var el = document.getElementById('peptideai-' + field);
            if (el) {
                el.classList.toggle('peptideai-field-valid', status);
                el.classList.toggle('peptideai-field-error', !status);
            }
        },
        timeoutCallback: function() {
            tokenRequestPending = false;
            showError('Card tokenization timed out. Please try again.');
        },
        fieldsAvailableCallback: function() {
            var form = document.getElementById('peptideai-card-form');
            if (form) form.classList.add('peptideai-card-form--ready');
        }
    });

    function bindCheckoutEvents() {
        $('form.checkout').off('checkout_place_order_peptideai_pool_gateway').on('checkout_place_order_peptideai_pool_gateway', function() {
            if (document.getElementById('peptideai-token').value) return true;
            if (tokenRequestPending) return false;
            tokenRequestPending = true;
            clearErrors();
            CollectJS.startPaymentRequest();
            return false;
        });
    }

    bindCheckoutEvents();
    $(document.body).on('updated_checkout', bindCheckoutEvents);

    function showError(msg) {
        var el = document.getElementById('peptideai-errors');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    function clearErrors() {
        var el = document.getElementById('peptideai-errors');
        if (el) { el.textContent = ''; el.style.display = 'none'; }
    }
});
