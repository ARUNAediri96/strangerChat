import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  onReport: (reason: string) => void;
}

const REASONS = [
  "Harassment or bullying",
  "Spam or advertising",
  "Inappropriate content",
  "Threats or violence",
  "Hate speech",
  "Other",
];

export default function ReportModal({ open, onClose, onReport }: ReportModalProps) {
  const [selected, setSelected] = useState("");
  const [customReason, setCustomReason] = useState("");

  if (!open) return null;

  const handleSubmit = () => {
    const reason = selected === "Other" ? customReason : selected;
    if (reason.trim()) {
      onReport(reason);
      setSelected("");
      setCustomReason("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-gray-900/95 border border-white/10 rounded-2xl p-6 backdrop-blur-xl animate-[fadeIn_0.2s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <h3 className="text-white font-semibold text-lg">Report User</h3>
        </div>

        <div className="space-y-2 mb-5">
          {REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => setSelected(reason)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-all ${
                selected === reason
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-gray-300"
              }`}
            >
              {reason}
            </button>
          ))}
        </div>

        {selected === "Other" && (
          <textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Describe the issue..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-red-400/50 mb-4 resize-none h-20"
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={!selected || (selected === "Other" && !customReason.trim())}
          className="w-full py-2.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit Report
        </button>
      </div>
    </div>
  );
}
