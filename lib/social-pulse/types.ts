// lib/social-pulse/types.ts
export interface PulsePost {
  postId: string;
  shortcode: string;
  permalink: string;
  username: string;
  isVerified: boolean;
  takenAt: string | null; // ISO
  mediaType: number | null; // 1 image · 2 video/clips · 8 carousel (vendor contract)
  productType: string | null; // feed | clips | carousel_container
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  viewCount: number | null;
  reshareCount: number | null;
}

export interface PulseHashtag {
  name: string;
  mediaCount: number | null;
  formattedMediaCount: string | null;
}
