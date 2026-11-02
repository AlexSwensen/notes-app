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
    <div className="icon-picker" ref={ref}>
      <div className="icon-picker-head">
        <span>Pick an icon</span>
        <button className="link-btn" onClick={() => onPick('')}>Remove</button>
      </div>
      <div className="icon-grid">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
