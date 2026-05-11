import { useState, useCallback, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";

interface FilterInputProps {
  filters: string[];
  onFiltersChange: (filters: string[]) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "anime",
  "gaming",
  "music",
  "coding",
  "python",
  "medical",
  "relationship advice",
  "travel",
  "photography",
  "fitness",
  "books",
  "movies",
  "cooking",
  "art",
  "science",
  "philosophy",
  "tech",
  "sports",
];

export default function FilterInput({
  filters,
  onFiltersChange,
  disabled,
}: FilterInputProps) {
  const [input, setInput] = useState("");

  const addFilter = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !filters.includes(trimmed) && filters.length < 8) {
        onFiltersChange([...filters, trimmed]);
      }
      setInput("");
    },
    [filters, onFiltersChange]
  );

  const removeFilter = useCallback(
    (tag: string) => {
      onFiltersChange(filters.filter((f) => f !== tag));
    },
    [filters, onFiltersChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addFilter(input);
    } else if (e.key === "Backspace" && !input && filters.length > 0) {
      removeFilter(filters[filters.length - 1]);
    }
  };

  const filteredSuggestions = SUGGESTIONS.filter(
    (s) =>
      !filters.includes(s) &&
      s.includes(input.toLowerCase()) &&
      input.length > 0
  ).slice(0, 5);

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 p-3 bg-white/5 border border-white/10 rounded-xl backdrop-blur-sm min-h-[52px] items-center focus-within:border-emerald-400/50 focus-within:ring-1 focus-within:ring-emerald-400/20 transition-all">
        {filters.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium border border-emerald-500/30 animate-[fadeIn_0.2s_ease-out]"
          >
            {tag}
            <button
              onClick={() => removeFilter(tag)}
              className="hover:text-white transition-colors"
              disabled={disabled}
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={filters.length === 0 ? "Add filters (optional)..." : ""}
          className="flex-1 min-w-[120px] bg-transparent text-white placeholder-gray-500 outline-none text-sm"
          disabled={disabled}
          maxLength={30}
        />
        {input && (
          <button
            onClick={() => addFilter(input)}
            className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
            disabled={disabled}
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      {filteredSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => addFilter(s)}
              className="px-2.5 py-1 text-xs text-gray-400 bg-white/5 border border-white/10 rounded-md hover:bg-white/10 hover:text-gray-300 transition-all"
              disabled={disabled}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
