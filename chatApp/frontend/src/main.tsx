import React from 'react';
import ReactDOM from 'react-dom/client';
import { Chat } from './modules/Chat.tsx';
import { Header } from './components/Header.tsx';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<Header />
		<div className="container chat-shell">
			<Chat />
		</div>
	</React.StrictMode>
);
