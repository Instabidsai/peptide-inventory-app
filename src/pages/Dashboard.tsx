import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBottleStats } from '@/hooks/use-bottles';
import { useMovements } from '@/hooks/use-movements';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Package, 
  TrendingUp, 
  ShoppingCart, 
  AlertTriangle,
  Plus,
  ArrowRight,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const { organization } = useAuth();
  const { data: stats, isLoading: statsLoading } = useBottleStats();
  const { data: movements, isLoading: movementsLoading } = useMovements();
  const { data: peptides } = usePeptides();

  const recentMovements = movements?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back to {organization?.name || 'your inventory'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/lots">
              <Plus className="mr-2 h-4 w-4" />
              Receive Inventory
            </Link>
          </Button>
          <Button asChild>
            <Link to="/movements/new">
              <ArrowRight className="mr-2 h-4 w-4" />
              Record Movement
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Stock</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.in_stock || 0}</div>
                <p className="text-xs text-muted-foreground">
                  bottles available
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sold</CardTitle>
            <ShoppingCart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.sold || 0}</div>
                <p className="text-xs text-muted-foreground">
                  bottles sold
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Given Away</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats?.given_away || 0}</div>
                <p className="text-xs text-muted-foreground">
                  promotional / at-cost
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Peptides</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{peptides?.length || 0}</div>
                <p className="text-xs text-muted-foreground">
                  products tracked
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Internal Use</p>
                <p className="text-xl font-semibold">{stats?.internal_use || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lost/Damaged</p>
                <p className="text-xl font-semibold">{stats?.lost || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Returned</p>
                <p className="text-xl font-semibold">{stats?.returned || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Latest inventory movements</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/movements">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {movementsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentMovements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No movements recorded yet</p>
                <Button asChild variant="link" className="mt-2">
                  <Link to="/movements/new">Record your first movement</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentMovements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10">
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {movement.type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {movement.contacts?.name || 'No contact'}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(movement.movement_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
