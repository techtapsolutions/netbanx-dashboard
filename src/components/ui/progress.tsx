import * as React from "react"

interface ProgressProps {
  value?: number
  className?: string
  color?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, color, ...props }, ref) => {
    const clampedValue = Math.max(0, Math.min(100, value))
    
    return (
      <div
        ref={ref}
        className={`relative h-4 w-full overflow-hidden rounded-full bg-secondary ${className || ''}`}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-all"
          style={{
            transform: `translateX(-${100 - clampedValue}%)`,
            backgroundColor: color || undefined
          }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }