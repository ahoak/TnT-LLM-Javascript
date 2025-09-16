import React from 'react';
const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000';

export const Header: React.FC = () => {
  return (
    <header className="site-header">
      <div className="brand">
        <div className="logo-wrap">
          <img
            src={`${BASE_URL}/shared/images/cascadiajs_website_image.png`}
            className="logo-img"
            alt=">Cascadia Tours logo"
            loading="lazy"
          />
        </div>
        <div className="brand-text">
          <span className="brand-name">Cascadia Tours</span>
          <span className="brand-tag">Journeys • Nature • Culture</span>
        </div>
      </div>
      <nav className="main-nav" aria-label="Primary navigation">
        <a href="#destinations">Destinations</a>
        <a href="#types">Experiences</a>
        <a href="#seasons">Seasons</a>
        <a href="#chat-root">Chat</a>
      </nav>
    </header>
  );
};
