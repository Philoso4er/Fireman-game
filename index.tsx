import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource/press-start-2p/400.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);