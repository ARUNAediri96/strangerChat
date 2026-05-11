export default function SearchAnimation() {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
        <div className="absolute inset-2 rounded-full border-2 border-emerald-400/50 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_0.5s_infinite]" />
        <div className="absolute inset-4 rounded-full border-2 border-emerald-400/70 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_1s_infinite]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 bg-emerald-400 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-white text-lg font-medium">Searching for a match</p>
        <p className="text-gray-500 text-sm mt-1">
          Connecting you with someone...
        </p>
      </div>
    </div>
  );
}
