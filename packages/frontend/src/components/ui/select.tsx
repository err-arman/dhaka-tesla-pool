import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * A native `<select>`, styled to match `Input`.
 *
 * Deliberately not a Radix-based select: that needs `@radix-ui/react-select`, which is not
 * a dependency here, and it would replace the platform's own picker with a custom list
 * box — which is a downgrade on a phone, where the native control opens a wheel. Two
 * static From/To pickers did not justify the dependency or the mobile regression.
 *
 * The native arrow is left visible instead of being hidden behind a chevron, since
 * there is no `lucide-react` to draw one and the arrow is a useful affordance anyway.
 *
 * `ref` is a normal prop in React 19, so this works with react-hook-form's `field` spread
 * the same way `Input` does.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        // `h-9` and the same border/radius/padding as Input, so the From and To fields
        // line up with every other input on the page.
        'border-input bg-transparent flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        // A transparent select on some platforms renders its option list on an opaque
        // white background, which is unreadable in dark mode. Giving the options their
        // own surface keeps the open list legible in both themes.
        '[&>option]:bg-popover [&>option]:text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Select }
