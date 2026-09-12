import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Game from './pages/game';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Game />
      <Toaster position="top-center" theme="dark" />
    </QueryClientProvider>
  );
}

export default App;