import { useEffect, useRef } from 'react';

const EMOJIS = '📝 📄 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 📌 📍 📎 ✏️ 🖊️ 🗂️ 📁 🗃️ 📅 📆 🗓️ ✅ ☑️ 💡 🔥 ⭐ 🌟 ✨ 🎯 🚀 💼 🏠 🏡 🧠 💭 💬 ❤️ 💜 💙 💚 💛 🧡 🎨 🎵 🎬 📷 🎮 🏃 🧘 🍳 🍕 ☕ 🌱 🌿 🌸 🌍 ✈️ 🧳 🏖️ 💰 📈 📊 🛒 🔧 ⚙️ 🧪 🔬 💻 🖥️ 📱 🐛 🔒 🔑 📣 🎉 🎁 🐶 🐱 🦊'.split(' ');

export function IconPicker({ onPick, onClose }: { onPick: (icon: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="absolute top-full left-0 z-30 w-[340px] bg-elevated rounded-lg shadow-pop p-2" ref={ref}>
      <div className="flex justify-between text-xs text-muted px-1 pt-0.5 pb-2">
        <span>Pick an icon</span>
        <button className="link-btn" onClick={() => onPick('')}>Remove</button>
      </div>
      <div className="grid grid-cols-10 gap-0.5">
        {EMOJIS.map((e) => (
          <button key={e} className="text-xl p-1 rounded hover:bg-hover" onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
