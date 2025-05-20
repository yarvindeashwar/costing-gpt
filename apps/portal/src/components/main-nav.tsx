'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { MessageSquare, FileText, Home } from 'lucide-react'

const navItems = [
  {
    name: 'Home',
    href: '/',
    icon: Home
  },
  {
    name: 'Chat',
    href: '/chat',
    icon: MessageSquare
  },
  {
    name: 'Documents',
    href: '/documents',
    icon: FileText
  }
]

export function MainNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center text-sm font-medium transition-colors hover:text-primary',
              pathname === item.href
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="mr-2 h-4 w-4" />
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
