import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Menu, LogOut, User, Settings, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const { profile, userRole, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U';

  const roleLabel = userRole?.role ? userRole.role.charAt(0).toUpperCase() + userRole.role.slice(1).replace('_', ' ') : '';
  const roleVariant = userRole?.role === 'admin' ? 'default' : userRole?.role === 'staff' ? 'secondary' : 'outline';

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search trigger */}
      <button
        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
        aria-label="Search"
        className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-xs font-medium sm:flex">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </button>

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full ring-offset-background transition-all hover:ring-2 hover:ring-primary/30 hover:ring-offset-2">
            <Avatar className="h-10 w-10 border-2 border-primary/20 transition-colors">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{profile?.full_name || 'User'}</p>
              <p className="text-xs leading-none text-muted-foreground">{profile?.email}</p>
              {roleLabel && (
                <Badge variant={roleVariant} className="w-fit mt-1 text-xs">
                  {roleLabel}
                </Badge>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
