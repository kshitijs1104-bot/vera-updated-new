import { Layout } from './components/layout/Layout';
import { CategoryProvider } from './lib/CategoryContext';
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { LinePage } from './pages/Line';
import { SightPage } from './pages/Sight';
import { CryptPage } from './pages/Crypt';
import { VenusPage } from './pages/Venus';
import { SettingsPage } from './pages/Settings';
import { SignupGate } from './pages/enterprise/Signup';
import { OnboardingGate } from './pages/enterprise/Onboarding';
import { PlanGate } from './pages/enterprise/Plan';
import { CheckoutGate } from './pages/enterprise/Checkout';
import { isEnterpriseUnlocked, getNextGateRoute } from './lib/enterpriseGate';

const queryClient = new QueryClient();

function VenusProtected() {
  const [, navigate] = useLocation();
  if (!isEnterpriseUnlocked()) {
    navigate(getNextGateRoute());
    return null;
  }
  return <VenusPage />;
}

function Router() {
  return (
    <Switch>
      {/* Enterprise gate flow — full screen, no Layout */}
      <Route path="/enterprise/signup" component={SignupGate} />
      <Route path="/enterprise/onboarding" component={OnboardingGate} />
      <Route path="/enterprise/plan" component={PlanGate} />
      <Route path="/enterprise/checkout" component={CheckoutGate} />

      {/* Main app with Layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={() => <Redirect to="/line" />} />
            <Route path="/line" component={LinePage} />
            <Route path="/sight" component={SightPage} />
            <Route path="/crypt" component={CryptPage} />
            <Route path="/venus" component={VenusProtected} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
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
