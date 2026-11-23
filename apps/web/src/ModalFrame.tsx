import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';

/** Keep keyboard focus inside the dialog and restore it to the opener on close. */
export function ModalFrame({
  children,
  label,
  onClose,
  busy = false,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const focusable = () =>
    Array.from(
      container.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
      ) || [],
    );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    focusable()[0]?.focus();
    return () => previous?.focus();
  }, []);
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onClose();
    }
    if (event.key !== 'Tab') return;
    const items = focusable(),
      first = items[0],
      last = items[items.length - 1];
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div className="modal-shade">
      <section
        ref={container}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
        onKeyDown={keyDown}
      >
        {children}
      </section>
    </div>
  );
}
