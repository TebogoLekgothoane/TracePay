import { Link } from 'expo-router';
import type { ComponentProps } from 'react';

export function ExternalLink(props: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  return (
    <Link
      target="_blank"
      {...props}
      href={props.href as never}
    />
  );
}
