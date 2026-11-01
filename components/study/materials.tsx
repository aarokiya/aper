import { Fragment } from 'react';
import type { StudyMaterialGroup } from '@/lib/study/types';

/** "Where to find your materials": a note per group, then its outside links (artifact materialsHTML). */
export function Materials({ groups }: { groups: StudyMaterialGroup[] }) {
  return groups.map((group) => (
    <Fragment key={group.h}>
      <p className="grpnote">
        <b>{group.h}.</b> {group.note}
      </p>
      <ul className="mlist">
        {group.items.map(([title, url, description]) => (
          <li key={`${title}-${url}`}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {title}
            </a>
            {description && <span>{description}</span>}
          </li>
        ))}
      </ul>
    </Fragment>
  ));
}
