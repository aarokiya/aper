import 'katex/dist/katex.min.css';
import './study.css';
import './review.css';
import './flashcards.css';
import './cards-admin.css';
import './notes.css';

/** Scope for the Study Hub views (artifact styles live under `.study`). */
export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="study">{children}</div>;
}
