import { useEffect, useMemo, useState } from 'react';
import { fetchSupplierPurchaseOrder, signSupplierPurchaseOrder } from '../api/inventory';
import SignaturePadField from './SignaturePadField';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const getSupplierQuote = (product, supplierId) => {
  if (!product || !supplierId || !Array.isArray(product.supplierPricing)) return null;
  return product.supplierPricing.find((entry) => String(entry?.supplier || '') === String(supplierId)) || null;
};

const SupplierSignPage = ({ token, onClose = null, onSigned = null, modal = false, initialPurchaseOrder = null }) => {
  const [purchaseOrder, setPurchaseOrder] = useState(initialPurchaseOrder);
  const [loading, setLoading] = useState(Boolean(token) || !initialPurchaseOrder);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!token) {
      setPurchaseOrder(initialPurchaseOrder);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchSupplierPurchaseOrder(token);
        setPurchaseOrder(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [initialPurchaseOrder, token]);

  const companyDocumentUrl = useMemo(() => {
    if (!purchaseOrder?.companyDocumentUrl) return '';
    return purchaseOrder.companyDocumentUrl.startsWith('http')
      ? purchaseOrder.companyDocumentUrl
      : `${API_ORIGIN}${purchaseOrder.companyDocumentUrl}`;
  }, [purchaseOrder]);

  const finalDocumentUrl = useMemo(() => {
    if (!purchaseOrder?.finalDocumentUrl) return '';
    return purchaseOrder.finalDocumentUrl.startsWith('http')
      ? purchaseOrder.finalDocumentUrl
      : `${API_ORIGIN}${purchaseOrder.finalDocumentUrl}`;
  }, [purchaseOrder]);
  const supplierQuote = useMemo(
    () => getSupplierQuote(purchaseOrder?.order?.product, purchaseOrder?.order?.supplier?._id),
    [purchaseOrder]
  );
  const supplierAlreadySigned = purchaseOrder?.status === 'Supplier Signed';

  const handleSave = async (signatureDataUrl) => {
    try {
      setSubmitting(true);
      setError('');
      const result = await signSupplierPurchaseOrder(token, { signatureDataUrl });
      setSuccess(result.message || 'Purchase order signed successfully.');
      setPurchaseOrder((current) => (
        current
          ? {
              ...current,
              finalDocumentUrl: result.finalDocumentUrl,
              status: 'Supplier Signed',
            }
          : current
      ));
      if (onSigned) {
        await onSigned();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const outerClassName = modal
    ? 'fixed inset-0 z-[140] flex items-center justify-center bg-black/80 px-4 py-10 backdrop-blur-sm'
    : 'min-h-screen bg-[#2C2B30] px-4 py-10 font-mono text-gray-200';

  const innerClassName = modal
    ? 'w-full max-w-3xl rounded-[28px] border border-[#5A595E] bg-[#36353A]/95 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] md:p-8'
    : 'mx-auto max-w-5xl rounded-[28px] border border-[#5A595E] bg-[#36353A]/85 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] md:p-8';

  if (loading) {
    return (
      <div className={outerClassName}>
        <div className={`${innerClassName} flex min-h-[240px] items-center justify-center font-mono text-white`}>
          Loading purchase order...
        </div>
      </div>
    );
  }

  if (error && !purchaseOrder) {
    return (
      <div className={outerClassName}>
        <div className={`${innerClassName} flex min-h-[240px] items-center justify-center px-6 text-center font-mono text-red-300`}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={outerClassName}>
      <div className={innerClassName}>
        <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[68%]">
            <div className="text-[12px] uppercase tracking-[0.18em] text-[#F2C4CE]">Supplier Confirmation</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{purchaseOrder?.poNumber}</h1>
            <p className="mt-2 text-[15px] leading-6 text-gray-400">
              {purchaseOrder?.order?.product?.name} for {purchaseOrder?.order?.warehouse}
            </p>
          </div>
          <div className="flex items-center gap-3 self-start lg:pt-0.5">
            <div className="rounded-full border border-[#F2C4CE]/25 bg-[#F2C4CE]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4]">
              {purchaseOrder?.status}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.04fr,0.96fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#5A595E] bg-black/10 p-5">
              <div className="text-[12px] uppercase tracking-[0.16em] text-gray-500">Order Details</div>
              <div className="mt-5 grid gap-4 text-[15px] sm:grid-cols-2">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Supplier</span>
                  <div className="mt-3 text-[17px] font-bold leading-snug text-white">{purchaseOrder?.order?.supplier?.name}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Expected Delivery</span>
                  <div className="mt-3 text-[17px] font-bold leading-snug text-white">
                    {purchaseOrder?.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString() : 'Pending'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Quantity</span>
                  <div className="mt-3 text-[17px] font-bold leading-snug text-white">
                    {purchaseOrder?.order?.quantity} {purchaseOrder?.order?.product?.unitOfMeasure || 'unit'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-5">
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Unit Price</span>
                  <div className="mt-3 text-[17px] font-bold leading-snug text-white">
                    PHP {Number((supplierQuote?.cost ?? purchaseOrder?.order?.product?.price) || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {companyDocumentUrl && !supplierAlreadySigned && (
              <a
                href={companyDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl border border-[#F2C4CE]/25 bg-[#F2C4CE]/10 px-5 py-3.5 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F2C4CE]/20 hover:text-white"
              >
                View Company Purchase Order
              </a>
            )}

            {success && <div className="rounded-2xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-[14px] leading-7 text-green-200">{success}</div>}
            {error && <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[14px] leading-7 text-red-200">{error}</div>}

            {finalDocumentUrl && (
              <a
                href={finalDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl border border-green-400/30 bg-green-400/10 px-5 py-3.5 text-[13px] font-bold uppercase tracking-[0.12em] text-green-200 transition hover:bg-green-400/20"
              >
                View Final Signed Purchase Order
              </a>
            )}
          </div>

          <div className="rounded-2xl border border-[#5A595E] bg-[#2C2B30]/70 p-6">
            <div className="text-[12px] uppercase tracking-[0.16em] text-[#F2C4CE]">Supplier Signature</div>
            {supplierAlreadySigned ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-[14px] leading-7 text-gray-300">
                Supplier signature is already complete for this purchase order.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-[15px] leading-7 text-gray-400">
                  Review the company purchase order, then draw your signature below to confirm the supplier side.
                </p>
                <SignaturePadField busy={submitting} buttonLabel="Confirm Supplier Signature" onSave={handleSave} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupplierSignPage;
