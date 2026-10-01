import ReactDOM from 'react-dom/client';
import ElementLabApp from './ElementLabApp';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(<ElementLabApp />);
