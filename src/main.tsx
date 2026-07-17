import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from '../amplify_outputs.json';
import App from './App.tsx';
import './index.css';

Amplify.configure(outputs);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* All access requires a signed-in user (§13) */}
    <Authenticator hideSignUp={false}>
      <App />
    </Authenticator>
  </React.StrictMode>,
);
