import { MainNav } from '@/components/main-nav'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          <a href="/" className="mr-6 flex items-center space-x-2">
            <span className="font-bold">Costing GPT</span>
          </a>
          <MainNav />
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          {/* Add user menu or other header elements here if needed */}
        </div>
      </div>
    </header>
  )
}
