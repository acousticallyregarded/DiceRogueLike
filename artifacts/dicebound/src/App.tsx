import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Game from './pages/game';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Game />
      <Toaster theme="dark" position="top-center" />
    </QueryClientProvider>
  );
}

export default App;