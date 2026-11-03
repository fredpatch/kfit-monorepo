import type { ReactNode } from "react";
import {
  catalogueCover,
  catalogueImageSrcSet,
  type CatalogueServiceImage,
} from "@kfit/shared";
import { familyMeta, familyOfSlug } from "../../../lib/families.js";
import { cn } from "../../../lib/utils.js";

/** CAT-04 C1/C2: the offer photo at 16:10, or the family colour, icon and label when there is none. */
export function OfferCover({
  image,
  slug,
  sizes,
  eager = false,
  className,
  children,
}: {
  image: CatalogueServiceImage | null;
  slug: string;
  /** `sizes` for the 640 / 1600 px srcset. */
  sizes: string;
  /** Above the fold (request page header): no lazy loading. */
  eager?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const cover = catalogueCover({ image });
  const meta = familyMeta[familyOfSlug(slug)];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "relative aspect-16/10 overflow-hidden",
        cover.kind === "family" && meta.softClass,
        className,
      )}
    >
      {cover.kind === "photo" ? (
        <img
          src={cover.image.urls.card}
          srcSet={catalogueImageSrcSet(cover.image)}
          sizes={sizes}
          width={cover.image.width}
          height={cover.image.height}
          alt={cover.image.altText}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-full flex-col items-center justify-center gap-2.5"
        >
          <span
            className="flex size-16 items-center justify-center rounded-[18px]"
            style={{ background: meta.colorVar }}
          >
            <Icon className="size-[30px] text-white" strokeWidth={2} />
          </span>
          <span className="text-[15px] font-extrabold">{meta.label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** CAT-04 C1: admin list thumbnail (16:10). Decorative: the offer name is next to it. */
export function OfferThumb({
  image,
  slug,
}: {
  image: CatalogueServiceImage | null;
  slug: string;
}) {
  const meta = familyMeta[familyOfSlug(slug)];
  return image ? (
    <img
      src={image.urls.card}
      alt=""
      width={48}
      height={30}
      loading="lazy"
      decoding="async"
      className="h-7.5 w-12 shrink-0 rounded-md object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-7.5 w-12 shrink-0 items-center justify-center rounded-md",
        meta.softClass,
      )}
    >
      <span className={cn("size-2.5 rounded-[3px]", meta.dotClass)} />
    </span>
  );
}
