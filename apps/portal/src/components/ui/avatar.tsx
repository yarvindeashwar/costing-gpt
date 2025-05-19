import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "inline-flex items-center justify-center rounded-full",
  {
    variants: {
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-16 w-16",
      },
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  fallback?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, size, variant, src, alt, fallback, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false);

    return (
      <div
        className={cn(avatarVariants({ size, variant }), className)}
        ref={ref}
        {...props}
      >
        {src && !imgError ? (
          <img
            src={src}
            alt={alt || "Avatar"}
            className="h-full w-full rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
            <span className="text-sm font-medium text-muted-foreground">
              {fallback || (alt ? alt.charAt(0).toUpperCase() : "A")}
            </span>
          </div>
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };
