import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, BookOpen, ExternalLink, Globe2, Leaf, LockKeyhole, ShieldCheck, Sprout } from 'lucide-react';
import { parseRoute } from './lib/routes';
import { AuthTestPanel } from './auth/AuthTestPanel';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Piante, pagina iniziale">
          <span className="brand-symbol"><Leaf size={22} strokeWidth={2.2} /></span>
          <span>Piante</span>
        </a>
        <nav className="header-links" aria-label="Navigazione principale">
          <a href="/app">Area personale</a>
          <a href="/gernotfound/public">Vetrina demo</a>
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span>Il tuo giardino, documentato.</span>
        <span>Versione sperimentale · Nessun dato pubblicato</span>
      </footer>
    </div>
  );
}

function Panel({ icon: Icon, title, description }: {
  icon: LucideIcon; title: string; description: string;
}) {
  return (
    <article className="feature-card">
      <span className="feature-icon"><Icon size={23} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}

export default function App() {
  const route = parseRoute(window.location.pathname);
  let content: ReactNode;

  if (route.kind === 'home') {
    content = (
      <>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-dot" /> Archivio botanico digitale</div>
          <h1>Ogni pianta ha<br /><em>una storia.</em></h1>
          <p className="hero-description">Documenta la crescita, organizza le cure e scegli cosa condividere con chi visita il tuo giardino.</p>
          <div className="hero-actions">
            <a className="primary-link" href="/app">La mia collezione <ArrowRight size={18} /></a>
            <a className="secondary-link" href="/gernotfound/public">Scopri la vetrina <ExternalLink size={16} /></a>
          </div>
          <p className="release-note"><ShieldCheck size={16} /> Sviluppo: gestione dati locali soltanto per gli account invitati nella modalità di prova.</p>
        </section>
        <section className="feature-grid" aria-label="Il progetto">
          <Panel icon={Sprout} title="Collezione" description="Una scheda per ogni esemplare, dal seme alla propagazione." />
          <Panel icon={BookOpen} title="Diario botanico" description="Cure, misurazioni, fotografie, fioriture e raccolti nel tempo." />
          <Panel icon={Globe2} title="Vetrina pubblica" description="Mostra soltanto le informazioni che deciderai di pubblicare." />
        </section>
      </>
    );
  } else if (route.kind === 'app') {
    content = (
      <section className="simple-page">
        <span className="page-kicker"><LockKeyhole size={17} /> Area privata</span>
        <h1>Il tuo spazio botanico.</h1>
        <p>L'archivio privato è in sviluppo. La modalità sperimentale consente solo agli account autorizzati di salvare dati locali su questo dispositivo; non è ancora attiva la sincronizzazione cloud.</p>
        <AuthTestPanel />
        <a className="secondary-link" href="/">Torna alla home <ArrowRight size={16} /></a>
      </section>
    );
  } else if (route.kind === 'profile') {
    content = (
      <section className="simple-page">
        <span className="page-kicker"><Globe2 size={17} /> Vetrina pubblica</span>
        <h1>{route.username}</h1>
        <p>Questa è la struttura di una futura vetrina. Nessuna pianta viene pubblicata o recuperata dai database in M0.</p>
        <a className="secondary-link" href="/">Esplora Piante <ArrowRight size={16} /></a>
      </section>
    );
  } else if (route.kind === 'plant') {
    content = (
      <section className="simple-page">
        <span className="page-kicker"><Leaf size={17} /> Scheda pubblica</span>
        <h1>{route.slug.replaceAll('-', ' ')}</h1>
        <p>Questo percorso sarà collegato a una scheda pubblicata e autorizzata. Per ora è soltanto un segnaposto.</p>
        <a className="secondary-link" href={'/' + route.username + '/public'}>Torna alla vetrina <ArrowRight size={16} /></a>
      </section>
    );
  } else {
    content = (
      <section className="simple-page">
        <span className="page-kicker">404 · Pagina non trovata</span>
        <h1>Questa pagina non esiste.</h1>
        <p>Controlla l'indirizzo o torna alla pagina iniziale.</p>
        <a className="primary-link" href="/">Torna alla home <ArrowRight size={16} /></a>
      </section>
    );
  }

  return <Shell>{content}</Shell>;
}
