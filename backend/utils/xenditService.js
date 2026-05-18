const XENDIT_API_BASE = 'https://api.xendit.co';
const PHP_CURRENCY = 'PHP';

const getXenditSecretKey = () => String(process.env.XENDIT_SECRET_KEY || '').trim();

const ensureXenditConfigured = () => {
    if (!getXenditSecretKey()) {
        throw new Error('Xendit is not configured. Add XENDIT_SECRET_KEY to your .env before using disbursements.');
    }
};

const buildXenditAuthHeader = () => `Basic ${Buffer.from(`${getXenditSecretKey()}:`).toString('base64')}`;

const buildJsonHeaders = (extraHeaders = {}) => ({
    Authorization: buildXenditAuthHeader(),
    'Content-Type': 'application/json',
    ...extraHeaders,
});

const parseJsonSafely = async (response) => {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch (error) {
        return { message: text };
    }
};

const mapCheckoutPaymentMethodToXendit = (paymentMethod) => {
    const normalized = String(paymentMethod || '').trim().toLowerCase();
    if (normalized === 'gcash') return 'GCASH';
    if (normalized === 'maya' || normalized === 'paymaya') return 'PAYMAYA';
    if (normalized === 'card' || normalized === 'credit_card') return 'CREDIT_CARD';
    return '';
};

const CHANNEL_NAME_ALIASES = {
    BPI: ['BPI'],
    BDO: ['BDO'],
    METROBANK: ['METROBANK', 'METROBANK'],
    UNIONBANK: ['UNIONBANK', 'UNION BANK', 'UBP'],
    LANDBANK: ['LANDBANK', 'LAND BANK', 'LBP'],
    PNB: ['PNB', 'PHILIPPINE NATIONAL BANK'],
    RCBC: ['RCBC', 'RIZAL COMMERCIAL BANKING CORPORATION'],
    SECURITY_BANK: ['SECURITY BANK'],
    CHINABANK: ['CHINABANK', 'CHINA BANK', 'CBC'],
    GCASH: ['GCASH', 'G-CASH'],
    MAYA: ['MAYA', 'PAYMAYA'],
};

const inferChannelAliases = (paymentMethod) => {
    const providerCode = String(paymentMethod?.providerCode || '').trim().toUpperCase();
    const methodName = String(paymentMethod?.methodName || '').trim().toUpperCase();
    const aliases = new Set([providerCode, methodName].filter(Boolean));

    (CHANNEL_NAME_ALIASES[providerCode] || []).forEach((alias) => aliases.add(alias));
    return [...aliases].filter(Boolean);
};

const fetchPayoutChannels = async () => {
    ensureXenditConfigured();

    const response = await fetch(`${XENDIT_API_BASE}/payouts_channels?currency=${PHP_CURRENCY}`, {
        method: 'GET',
        headers: buildJsonHeaders(),
    });

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new Error(data?.error_message || data?.message || 'Failed to fetch Xendit payout channels.');
    }

    return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
};

const resolveXenditChannel = async (paymentMethod) => {
    const aliases = inferChannelAliases(paymentMethod);
    const payoutChannels = await fetchPayoutChannels();

    const exactMatch = payoutChannels.find((channel) => {
        const channelCode = String(channel?.channel_code || '').trim().toUpperCase();
        const channelName = String(channel?.channel_name || '').trim().toUpperCase();
        const currency = String(channel?.currency || '').trim().toUpperCase();
        if (currency && currency !== PHP_CURRENCY) return false;
        return aliases.includes(channelCode) || aliases.some((alias) => channelName.includes(alias));
    });

    if (exactMatch) {
        return {
            channelCode: String(exactMatch.channel_code || '').trim(),
            channelName: String(exactMatch.channel_name || '').trim(),
        };
    }

    throw new Error(
        `No supported Xendit payout channel was found for supplier method ${paymentMethod?.methodName || paymentMethod?.providerCode || 'Unknown'}. ` +
        'Update the supplier payment method to a supported payout destination.'
    );
};

const createSupplierDisbursement = async ({ order, supplier, paymentMethod, amount }) => {
    ensureXenditConfigured();

    if (!order?._id) {
        throw new Error('Order context is required for the disbursement.');
    }

    if (!supplier?.email) {
        throw new Error('Supplier email is required before creating a Xendit disbursement.');
    }

    if (!paymentMethod?.accountName || !paymentMethod?.accountNumber) {
        throw new Error('Supplier payment method is incomplete. Save a valid payout destination first.');
    }

    const normalizedAmount = Number(amount || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        throw new Error('Disbursement amount must be greater than 0.');
    }

    const { channelCode, channelName } = await resolveXenditChannel(paymentMethod);
    const referenceId = `lumiere-disbursement-${order._id}`;
    const descriptionProduct = order.product?.name || order.productName || 'Supplier order';

    const payload = {
        reference_id: referenceId,
        channel_code: channelCode,
        channel_properties: {
            account_holder_name: paymentMethod.accountName,
            account_number: paymentMethod.accountNumber,
        },
        amount: normalizedAmount,
        currency: PHP_CURRENCY,
        description: `Lumiere supplier disbursement for ${descriptionProduct}`,
        receipt_notification: {
            email_to: [supplier.email],
            email_cc: [],
        },
        metadata: {
            order_id: String(order._id),
            supplier_id: String(supplier._id || ''),
            supplier_name: supplier.name || '',
        },
    };

    const response = await fetch(`${XENDIT_API_BASE}/payouts`, {
        method: 'POST',
        headers: buildJsonHeaders({
            'Idempotency-key': referenceId,
        }),
        body: JSON.stringify(payload),
    });

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new Error(data?.message || 'Xendit disbursement failed.');
    }

    return {
        id: String(data?.id || ''),
        referenceId,
        status: String(data?.status || 'ACCEPTED'),
        failureCode: String(data?.failure_code || ''),
        errorMessage: String(data?.error_message || data?.message || ''),
        channelCode,
        channelName,
        response: data,
    };
};

const getPayoutById = async (payoutId) => {
    ensureXenditConfigured();

    const normalizedPayoutId = String(payoutId || '').trim();
    if (!normalizedPayoutId) {
        throw new Error('Xendit payout ID is required to refresh the disbursement status.');
    }

    const response = await fetch(`${XENDIT_API_BASE}/v2/payouts/${normalizedPayoutId}`, {
        method: 'GET',
        headers: buildJsonHeaders(),
    });

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new Error(data?.message || 'Failed to refresh the Xendit payout status.');
    }

    return {
        id: String(data?.id || normalizedPayoutId),
        referenceId: String(data?.reference_id || ''),
        status: String(data?.status || ''),
        channelCode: String(data?.channel_code || ''),
        channelName: String(data?.channel_name || ''),
        failureCode: String(data?.failure_code || ''),
        errorMessage: String(data?.error_message || data?.message || ''),
        response: data,
    };
};

const createSupplierDisbursementCheckout = async ({ order, supplier, amount, paymentMethod, payer }) => {
    ensureXenditConfigured();

    const normalizedAmount = Number(amount || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        throw new Error('Disbursement amount must be greater than 0.');
    }

    const paymentMethodCode = mapCheckoutPaymentMethodToXendit(paymentMethod);
    const referenceId = `lumiere-payable-${order._id}-${Date.now()}`;
    const frontendBaseUrl = String(process.env.FRONTEND_BASE_URL || 'http://localhost:5173').trim();
    const supplierName = supplier?.name || 'Supplier';
    const productName = order?.product?.name || 'Supplier order';
    const payerName = String(payer?.name || 'Lumiere Accountant').trim();
    const payerEmail = String(payer?.email || '').trim().toLowerCase();
    const normalizedPaymentMethod = String(paymentMethod || '').trim().toLowerCase();
    const isWalletCheckout = ['gcash', 'maya', 'paymaya'].includes(normalizedPaymentMethod);
    const isCardCheckout = ['card', 'credit_card'].includes(normalizedPaymentMethod);
    const primarySupplierMethod = Array.isArray(supplier?.paymentMethods)
        ? (supplier.paymentMethods.find((method) => method?.isPrimary) || supplier.paymentMethods[0] || null)
        : null;
    const supplierMobileNumber = String(
        primarySupplierMethod?.accountNumber
        || supplier?.phone
        || ''
    ).trim();

    const payload = {
        external_id: referenceId,
        amount: normalizedAmount,
        payer_email: payerEmail || undefined,
        description: `Lumiere supplier disbursement for ${supplierName} - ${productName}`,
        currency: PHP_CURRENCY,
        success_redirect_url: `${frontendBaseUrl}/?tab=expenses&expenseSubTab=payables&expenseViewMode=current&accountingRef=${encodeURIComponent(referenceId)}&accountingState=success`,
        failure_redirect_url: `${frontendBaseUrl}/?tab=expenses&expenseSubTab=payables&expenseViewMode=current&accountingRef=${encodeURIComponent(referenceId)}&accountingState=failure`,
        ...(paymentMethodCode ? { payment_methods: [paymentMethodCode] } : {}),
        ...(!isCardCheckout ? { should_exclude_credit_card: true } : {}),
        ...(isWalletCheckout ? { should_send_email: false } : {}),
        customer: {
            given_names: payerName || 'Lumiere',
            email: payerEmail || undefined,
            ...(isWalletCheckout && supplierMobileNumber ? { mobile_number: supplierMobileNumber } : {}),
        },
        items: [
            {
                name: `${supplierName} payable - ${productName}`,
                quantity: 1,
                price: normalizedAmount,
                category: 'supplier_payable',
            },
        ],
        metadata: {
            order_id: String(order?._id || ''),
            supplier_id: String(supplier?._id || ''),
            supplier_name: supplierName,
            payment_flow: 'accounts_payable',
        },
    };

    const response = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
        method: 'POST',
        headers: buildJsonHeaders(),
        body: JSON.stringify(payload),
    });

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new Error(data?.message || data?.error_code || 'Failed to create the Xendit checkout.');
    }

    return {
        id: String(data?.id || ''),
        referenceId,
        status: String(data?.status || 'PENDING'),
        checkoutUrl: String(data?.invoice_url || '').trim(),
        paymentMethodCode: paymentMethodCode || 'BANK_ACCOUNT',
        response: data,
    };
};

const getInvoiceById = async (invoiceId) => {
    ensureXenditConfigured();

    const normalizedInvoiceId = String(invoiceId || '').trim();
    if (!normalizedInvoiceId) {
        throw new Error('Xendit invoice ID is required to refresh the checkout status.');
    }

    const response = await fetch(`${XENDIT_API_BASE}/v2/invoices/${encodeURIComponent(normalizedInvoiceId)}`, {
        method: 'GET',
        headers: buildJsonHeaders(),
    });

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new Error(data?.message || data?.error_code || 'Failed to refresh the Xendit invoice status.');
    }

    return {
        id: String(data?.id || normalizedInvoiceId),
        referenceId: String(data?.external_id || ''),
        status: String(data?.status || ''),
        checkoutUrl: String(data?.invoice_url || '').trim(),
        response: data,
    };
};

module.exports = {
    createSupplierDisbursement,
    getPayoutById,
    createSupplierDisbursementCheckout,
    getInvoiceById,
};
