import { createContext, useCallback, useContext, useRef, useState, type ReactElement, type ReactNode } from 'react';

export interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** `danger` paints the confirm button in the error colour. */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) …` */
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);

/**
 * One native `<dialog>` for the whole SPA. Used only where an action is hard
 * to undo or interrupts someone else's run — everything TTL-bounded and
 * self-reverting runs on one click.
 */
export function ConfirmProvider({ children }: { children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    resolver.current?.(false);
    setRequest(next);
    // Open after React has rendered the new content into the dialog.
    queueMicrotask(() => ref.current?.showModal());
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean): void => {
    resolver.current?.(ok);
    resolver.current = null;
    ref.current?.close();
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        className="confirm"
        aria-labelledby="confirm-title"
        onClose={() => settle(false)}
        onClick={(e) => {
          // A click on the backdrop lands on the <dialog> element itself.
          if (e.target === e.currentTarget) settle(false);
        }}
      >
        {request ? (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              settle(true);
            }}
          >
            <h2 id="confirm-title">{request.title}</h2>
            <div className="confirm-body">{request.body}</div>
            <div className="confirm-actions">
              <button type="button" className="ghost" onClick={() => settle(false)} autoFocus>
                Cancel
              </button>
              <button type="submit" className={request.tone === 'danger' ? 'danger' : 'primary'}>
                {request.confirmLabel}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </ConfirmContext.Provider>
  );
}
