import * as React from 'react'

import { cn } from '@/lib/utils'
import { ImeInput } from '@/lib/ime-text-field'

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  /** `xs` is a control-row field as tall as `Button size="xs"`, at its natural width. */
  size?: 'default' | 'xs'
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = 'default', ...props }, ref) => {
    return (
      <ImeInput
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          size === 'xs' && 'h-6 w-auto max-w-full px-2 py-0 text-sm md:text-sm',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export { Input }
