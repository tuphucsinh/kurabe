'use client';

import { useEffect } from 'react';

export default function AutoPrint() {
  useEffect(() => {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      window.print();
    };

    // Đợi mọi ảnh trong trang load xong (print preview cần ảnh render đủ)
    const waitImages = () => {
      const imgs = Array.from(document.images);
      const pending = imgs.filter((img) => !img.complete);
      if (pending.length === 0) {
        fire();
        return;
      }
      let done = 0;
      const onLoad = () => {
        done += 1;
        if (done >= pending.length) fire();
      };
      pending.forEach((img) => {
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onLoad, { once: true });
      });
      // fallback an toàn: tối đa 5 giây
      setTimeout(fire, 5000);
    };

    // Đợi DOM + layout hoàn tất, thêm delay nhỏ để React/ảnh paint
    if (document.readyState === 'complete') {
      setTimeout(waitImages, 500);
    } else {
      window.addEventListener('load', () => setTimeout(waitImages, 500), { once: true });
      setTimeout(waitImages, 3000);
    }

    return () => { fired = true; };
  }, []);

  return null;
}
