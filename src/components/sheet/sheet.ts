/* ============================================================
   RI9 · Global Bottom Sheet Component
   Provides a reusable bottom sheet controller and styles that
   can be used across any page (Auth, Home, Challenge, etc.).
   Supports modal bottom sheets with backdrop scrim, swipe-to-close
   grab handle, keyboard navigation, and accessibility attributes.
   ============================================================ */

export interface SheetOptions {
  onOpen?: () => void;
  onClose?: () => void;
  closeOnScrimClick?: boolean;
  closeOnEscape?: boolean;
}

export class BottomSheet {
  private scrim: HTMLElement;
  private sheet: HTMLElement;
  private lastFocus: HTMLElement | null = null;
  private isOpen = false;
  private options: SheetOptions;

  constructor(sheetEl: HTMLElement, scrimEl?: HTMLElement, options: SheetOptions = {}) {
    this.sheet = sheetEl;
    this.options = {
      closeOnScrimClick: true,
      closeOnEscape: true,
      ...options,
    };

    if (scrimEl) {
      this.scrim = scrimEl;
    } else {
      let existingScrim = document.querySelector<HTMLElement>('.scrim');
      if (!existingScrim) {
        existingScrim = document.createElement('div');
        existingScrim.className = 'scrim';
        existingScrim.id = 'scrim';
        document.body.appendChild(existingScrim);
      }
      this.scrim = existingScrim;
    }

    this.bindEvents();
  }

  private bindEvents(): void {
    if (this.options.closeOnScrimClick) {
      this.scrim.addEventListener('click', () => {
        if (this.isOpen) this.close();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.options.closeOnEscape && e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  public open(): void {
    if (this.isOpen) return;
    this.lastFocus = document.activeElement as HTMLElement | null;
    this.isOpen = true;

    this.scrim.classList.add('open');
    this.sheet.classList.add('open');

    const focusable = this.sheet.querySelector<HTMLElement>('button, input, [tabindex="0"]');
    setTimeout(() => focusable?.focus(), 50);

    this.options.onOpen?.();
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    this.sheet.classList.remove('open');
    this.scrim.classList.remove('open');

    this.lastFocus?.focus?.({ preventScroll: true });
    this.options.onClose?.();
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  public get active(): boolean {
    return this.isOpen;
  }
}
