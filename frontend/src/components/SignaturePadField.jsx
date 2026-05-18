import { useEffect, useRef, useState } from 'react';

const SIGNATURE_INK = '#111111';

const SignaturePadField = ({ busy = false, buttonLabel = 'Save Signature', onSave }) => {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width * ratio;
    canvas.height = bounds.height * ratio;

    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.lineWidth = 3.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = SIGNATURE_INK;
  }, []);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = 'touches' in event ? event.touches[0] : event;

    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    };
  };

  const begin = (event) => {
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    isDrawingRef.current = true;
    setHasSignature(true);
  };

  const draw = (event) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    const context = canvasRef.current.getContext('2d');
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const end = (event) => {
    if (!isDrawingRef.current) return;
    event?.preventDefault?.();
    isDrawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.lineWidth = 3.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = SIGNATURE_INK;
    setHasSignature(false);
  };

  const save = () => {
    if (!hasSignature || busy) return;
    onSave(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#D8CFC7] bg-[#F7F1EA] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
        <canvas
          ref={canvasRef}
          className="h-52 w-full touch-none rounded-xl bg-[#FFFDF9]"
          onMouseDown={begin}
          onMouseMove={draw}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={begin}
          onTouchMove={draw}
          onTouchEnd={end}
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={clear}
          className="flex-1 rounded-xl border border-[#5A595E] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-gray-300 transition hover:bg-white/5"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!hasSignature || busy}
          onClick={save}
          className="flex-1 rounded-xl bg-[#F2C4CE] px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2C2B30] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving...' : buttonLabel}
        </button>
      </div>
    </div>
  );
};

export default SignaturePadField;
