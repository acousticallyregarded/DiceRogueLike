import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Game from './pages/game';
import { AudioProvider } from './audio/use-audio';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AudioProvider>
        <Game />
      </AudioProvider>
      <Toaster position="top-center" theme="dark" />
    </QueryClientProvider>
  );
}

export default App;