import { useEffect, useState } from 'react';
import {
  DEFAULT_COURSE_PHOTO,
  courseHeroFallback,
  courseHeroImage,
} from '../../lib/courseImages';

type Props = {
  seed: string;
  alt?: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

export function CourseHeroImage({
  seed,
  alt = '',
  className,
  loading = 'lazy',
}: Props) {
  const [src, setSrc] = useState(() => courseHeroImage(seed));

  useEffect(() => {
    setSrc(courseHeroImage(seed));
  }, [seed]);

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => {
        setSrc((current) => {
          if (current === DEFAULT_COURSE_PHOTO) return current;
          return courseHeroFallback(seed, current);
        });
      }}
    />
  );
}
