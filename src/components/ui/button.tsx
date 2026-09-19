'use client';

import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { useHapticFeedback, type HapticPattern } from '@/hooks/use-haptic-feedback';
import { cn } from '@/lib/utils';

/**
 * The app's button.
 *
 * Haptics are wired in at this level rather than at each call site: a tap that
 * buzzes on one screen and not another feels broken, and routing it through the
 * one component that every tap goes through is the only way to keep it
 * consistent. `haptic={false}` opts a button out.
 *
 * The 44px minimum height is not decoration — it is the smallest target that
 * stays reliably tappable on a phone held one-handed.
 */

const buttonVariants = cva(
  'kz-pressable inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill text-body font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // Fills come from the semantic tokens, whose label contrast is asserted
      // in `tests/contrast.test.ts`. The previous `bg-rose text-white` was
      // 3.4:1 on the dark theme — `--kz-rose` is an ink colour, and white does
      // not sit on it.
      variant: {
        primary: 'bg-violet-gradient text-primary-foreground shadow-fab hover:brightness-110',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        outline: 'border border-border-strong bg-transparent text-foreground hover:bg-card',
        ghost: 'bg-transparent text-subtle-foreground hover:bg-card hover:text-foreground',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-110',
        success: 'bg-success text-success-foreground hover:brightness-110',
      },
      size: {
        sm: 'h-11 px-4 text-caption',
        md: 'h-12 px-5',
        lg: 'h-14 px-6 text-body-lg',
        icon: 'h-11 w-11 rounded-full p-0',
        block: 'h-14 w-full px-6 text-body-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  /** Pattern fired on press, or `false` to stay silent. */
  haptic?: HapticPattern | false;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, isLoading, haptic = 'light', onClick, children, ...props },
  ref,
) {
  const haptics = useHapticFeedback();
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={props.disabled || isLoading}
      onClick={(event) => {
        // Fired inside the gesture handler, which is the only place Chrome
        // honours `navigator.vibrate()`.
        if (haptic) haptics.impact(haptic);
        onClick?.(event);
      }}
      {...props}
    >
      {isLoading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {/* `Slottable` rather than a bare `{children}`: with `asChild`, `Slot`
          demands exactly one element child, and the spinner slot beside it —
          even when it renders `null` — is a second one. Without this, every
          `asChild` usage throws `React.Children.only`. */}
      <Slottable>{children}</Slottable>
    </Component>
  );
});

export { buttonVariants };
