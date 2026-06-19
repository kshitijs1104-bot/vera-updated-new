import { Layout } from './components/layout/Layout';
import { CategoryProvider } from './lib/CategoryContext';
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { LinePage } from './pages/Line';
import { SightPage } from './pages/Sight';
import { CryptPage } from './pages/Crypt';
import { ThoughtsPage } from './pages/Thoughts';
import { VenusPage } from './pages/Venus';
import { SettingsPage } from './pages/Settings';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/line" />} />
        <Route path="/line" component={LinePage} />
        <Route path="/sight" component={SightPage} />
        <Route path="/crypt" component={CryptPage} />
        <Route path="/thoughts" component={ThoughtsPage} />
        <Route path="/venus" component={VenusPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CategoryProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </CategoryProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
