# INSTAGRAM SOCIAL — STEADY (SteadyAPI vendor reference)

> Source: https://docs.steadyapi.com/ (Instagram Social section) — crawled live via crawl4ai 07/05/2026.
> Verbatim vendor contract. Internal reference only — never surface the vendor name in product output (locked rule).

## Basics (apply to EVERY SteadyAPI endpoint, all socials)

- **Base URL:** `https://api.steadyapi.com`
- **Auth:** `Authorization: Bearer {YOUR_AUTH_KEY}` header, or `?apikey=` query param in a browser. Tokens: dashboard → account (upper-right) → Personal Access Tokens (https://steadyapi.com/profile/personal-access-tokens).
- **Global rate limit:** 15 requests/second → `429 Too Many Requests` beyond that; vendor recommends retry with backoff.
- **Endpoint weights:** each endpoint has a weight (cost multiplier against your quota). Instagram: `/search` = 2, everything else = 1.
- **Response envelope (every endpoint):** `{ "meta": { "version", "status", "copywrite", ...request echo... }, "body": [ ... ] | { ... } }`
- **Common errors (identical across all endpoints):**
  - `401` → `{"message": "Unauthenticated."}`
  - `403` → `{"message": "This action is unauthorized."}`
  - `404` → `{"success": false, "message": "Resource Not Found"}`
  - `422` → `{"message": "The <field> field is required.", "errors": {"<field>": ["..."]}}`

## Instagram `/search` is TOKEN-only — field-verified 07/08/2026 (17 real calls)

`/v1/instagram/search` for concept discovery wants **single hashtag-style tokens**, not multi-word phrases.
`aimarketing` / `emaildesign` / `canva` each returned ~24 posts; the phrase `email marketing AI` returned
HTTP 200 with `{"success": false}` and an empty `body`. Same "check `body.success !== false` even on a 200"
guard as Reddit. A few valid-looking single tokens also came back empty (`midjourney`, `designhacks`,
`coldemail`) — token-sensitivity on the vendor side, not a client bug; reword/try a sibling token. Captions
carry no external URLs (link-in-bio), so IG `/search` is an engagement/signal surface, not a crawl-target source.

## Instagram pagination & token expiration (CRITICAL)

Most collection endpoints (posts, followers, following, comments, search, likes) paginate:

- **Pagination token** returned in `meta.pagination_token` of each response.
- **Token lifetime: 15 minutes** — expired tokens mean restarting the walk.
- **Usage:** pass it back as the `pagination_token` query param on the next request; leave empty on the first request.
- **Session consistency:** the same session is maintained throughout a pagination walk.
- **Session rate limit: 20 requests per 15 minutes** for pagination requests (separate from the 15 req/s global limit).
- On `/followers`: a `null` pagination token means the account's followers are restricted.

## Instagram endpoint map (13 endpoints, all GET, all require auth)

Search: `/v1/instagram/search` (posts by term, weight 2) · `/v1/instagram/hashtags/search` · `/v1/instagram/users/search` · `/v1/instagram/similar-accounts`
User account: `/v1/instagram/profile` · `/v1/instagram/posts` · `/v1/instagram/following` · `/v1/instagram/followers` · `/v1/instagram/highlights`
Post details: `/v1/instagram/info` · `/v1/instagram/comments` · `/v1/instagram/related-posts` · `/v1/instagram/likes`

NOTE: doc section headings say `GET /v1/search` etc., but the REAL paths are prefixed `/v1/instagram/...` (confirmed in every code example). Same pattern for other socials (`/v1/twitter/...`, `/v1/reddit/...`).

Key response fields to know:
- Post objects: `id`, `shortcode` (the `/p/<code>/` URL part — this is what `info`/`comments`/`likes`/`related-posts` take as `code`), `media_type` (1 = image, 2 = video/clips, 8 = carousel), `product_type` (`feed` / `clips` / `carousel_container`), `taken_at` (unix), `like_count`, `comment_count`, `view_count`, `reshare_count`, `media_url`, `thumbnail_url`, `permalink`, `is_paid_partnership`, embedded `user`, optional `location {id,name,lat,lng}`, `carousel_media[]`.
- Profile: `followers`, `following`, `posts`, `biography`, `external_url`, `is_verified`, `is_private`, `is_business`, `account_type`, `profile_pic_hd`.
- Hashtag search: `name`, `media_count`, `formatted_media_count` ("1.8M").
- CDN media URLs (`scontent-*.cdninstagram.com`) are signed and EXPIRE (`oe=` param) — download/rehost immediately, never store the raw URL as a long-lived asset.

---

# Instagram Social — full endpoint reference

## GET /v1/instagram/search

requires authentication · Endpoint weight: 2 · Search for users, hashtags, and locations.

#### **Query Parameters**
**`search`** string   

Enter a search term. Example: `investing`
**`pagination_token`** string _optional_   

Use the value from the previous request to paginate. Leave empty in the first request.

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/search'
params = {
  'search': 'investing',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "search": "mrbeast",
    "pagination_token": "53b64277-c9c3-46a1-ad3e-a7978ff97bb3-55916361c73744a1b97e1b7157260656"
  },
  "body": [
    {
      "id": "3744744884516299440",
      "shortcode": "DP4AaHIDiKw",
      "media_type": 1,
      "product_type": "feed",
      "taken_at": 1760628398,
      "caption": "🚨 CASTING ALL AGES for a brand new project! \n\nWe’re looking for people of all ages, from kids to grandparents. If your parents or grandparents are healthy, active, and full of personality, I would love for them to APPLY NOW through the link in bio! This one’s going to be special! 😊🙏🏼\n\n#castingcall #northcarolina #greenvillenc #raleigh #mrbeast #castingkids #allageswelcome",
      "like_count": 56129,
      "comment_count": 2644,
      "view_count": null,
      "thumbnail_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.82787-15/565979027_17988463676891149_2840060347510450171_n.jpg?stp=dst-jpg_e35_p1080x1080_tt6&_nc_cat=103&ig_cache_key=Mzc0NDc0NDg4NDUxNjI5OTQ0MA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTgwMC5zZHIuQzMifQ%3D%3D&_nc_ohc=5SZISGkgKqQQ7kNvwFTerod&_nc_oc=AdlqvD5Lv1yZe4mOYUn5OMM9iFefrRzexUnkP_ddrs_X8SPW2wD1u1w1DJV0VszqNZoSKRM_znH1EvYRJb7cwx6X&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=ewoDniC9waMjU6fH16EJYw&oh=00_AfmBGcSEM3RcurXVeLy7kGSU2z3_TDpWkF5FYG2fCcdQcA&oe=694963C6",
      "media_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.82787-15/565979027_17988463676891149_2840060347510450171_n.jpg?stp=dst-jpg_e35_p1080x1080_tt6&_nc_cat=103&ig_cache_key=Mzc0NDc0NDg4NDUxNjI5OTQ0MA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTgwMC5zZHIuQzMifQ%3D%3D&_nc_ohc=5SZISGkgKqQQ7kNvwFTerod&_nc_oc=AdlqvD5Lv1yZe4mOYUn5OMM9iFefrRzexUnkP_ddrs_X8SPW2wD1u1w1DJV0VszqNZoSKRM_znH1EvYRJb7cwx6X&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=ewoDniC9waMjU6fH16EJYw&oh=00_AfmBGcSEM3RcurXVeLy7kGSU2z3_TDpWkF5FYG2fCcdQcA&oe=694963C6",
      "width": 1440,
      "height": 1800,
      "permalink": "https://www.instagram.com/p/DP4AaHIDiKw/",
      "user": {
        "id": "56844315148",
        "username": "mrbeastcasting",
        "full_name": "MrBeast Casting",
        "profile_pic_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/319881538_917699149392399_52063817761845277_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGRxBSD4SsVdvMfL5XpMbyTPzBhfZOGfIK0MIRsoMPbMyDvP4tCVLAQq5f5pIU1v2oWvolwE-45tWnHcyf4ZXSI&_nc_ohc=ZjOFBigHt1QQ7kNvwEVi5rx&_nc_gid=ewoDniC9waMjU6fH16EJYw&edm=AFlAz-oBAAAA&ccb=7-5&oh=00_AfkIiXXDb5_8IHZ00aB-EyvplOIoAQgeEe_rHqJ3VgvZCA&oe=694957E7&_nc_sid=76c0fc",
        "is_verified": true
      },
      "location": {
        "id": "287507687",
        "name": "North Carolina",
        "lat": 35.5,
        "lng": -80
      },
      "is_paid_partnership": false
    },
    { ... }
  ]
}
```

## GET /v1/instagram/hashtags/search

requires authentication · Endpoint weight: 1 · Returns hashtags matching the query string, useful for tag discovery and autocomplete.

#### **Query Parameters**
**`search`** string   

The name of the tag to fetch related post for. Example: `investing`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/hashtags/search'
params = {
  'search': 'investing',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
  "version": "v1.0",
  "status": 200,
  "copywrite": "https://steadyapi.com",
  "search": "investing"
},
"body": [
  {
    "id": 17843685037055240,
    "name": "investingtips",
    "media_count": 1826347,
    "formatted_media_count": "1.8M",
    "search_result_subtitle": "1.8M posts",
    "profile_pic_url": "",
    "use_default_avatar": true,
    "challenge_id": 1
  },
  { ... }
  ]
}
```

## GET /v1/instagram/users/search

requires authentication · Endpoint weight: 1 · Returns a list of Instagram users that match the query string. Useful for autocomplete

#### **Query Parameters**
**`search`** string   

Enter a username to search for users. Example: `mrbeast`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/users/search'
params = {
  'search': 'mrbeast',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "search": "mrbeast",
    "total": 55
  },
  "body": [
    {
      "id": 2278169415,
      "username": "mrbeast",
      "full_name": "MrBeast",
      "profile_pic": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/31077884_211593632905749_1394765701385814016_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QEutIUCBeEck0y6bdogecqHGeyPIxUb1UMdnrUpxkdmdqWO18kOosjdFWSZwZPOxCH8GJAxEiKfbL2NZaYaC-xh&_nc_ohc=BQmIrdrjmzwQ7kNvwEapRRP&_nc_gid=SzXheygg5b_5GHac-Vjt4A&edm=AM7KJZYBAAAA&ccb=7-5&ig_cache_key=GPw12gEVelN7ccAAAAAAAAAENFsTbkULAAAB1501500j-ccb7-5&oh=00_AfkIWJKyUdYe9MGrmVjnpntrQGyLjrIra5PdPArEXxcnDA&oe=6949630F&_nc_sid=8ec269",
      "is_verified": true,
      "is_private": false,
      "latest_reel_media": 0,
      "has_anonymous_profile_picture": false,
      "friendship_status": {
        "following": false,
        "incoming_request": false,
        "outgoing_request": false
      },
      "profile_url": "https://www.instagram.com/mrbeast/"
    },
    { ... }
  ]
}
```

## GET /v1/instagram/similar-accounts

requires authentication · Endpoint weight: 1 · Retrieve accounts similar to a given user.

#### **Query Parameters**
**`username`** string   

Enter an instagram account username. Example: `mrbeast`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/similar-accounts'
params = {
  'username': 'mrbeast',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "user": "2278169415"
  },
  "body": [
    {
      "friendship_status": null,
      "full_name": "Cristiano Ronaldo",
      "is_verified": true,
      "pk": "173560420",
      "profile_pic_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-19/472007201_1142000150877579_994350541752907763_n.jpg?stp=dst-jpg_s320x320_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2AGP8wVfXE7ljnDBITpjT9Gu0nC3VCrAI5jFLFzcelL6A9KO0UkSgh9xI9frYO-WwcRK55XTaiJEAZkNt4A00Ppm&_nc_ohc=g_GKlvWEvacQ7kNvgG-zlW6&_nc_gid=41d87ac59bf449a698da19ca8e499ca2&edm=AEJre34BAAAA&ccb=7-5&oh=00_AYE2MGFEIWwZTgUmemJAVanINiQOrjkWWqReaCPODxFmVg&oe=67D9991E&_nc_sid=35743f",
      "username": "cristiano",
      "is_private": false,
      "supervision_info": null,
      "social_context": "Cristiano Ronaldo",
      "live_broadcast_visibility": null,
      "live_broadcast_id": null,
      "hd_profile_pic_url_info": null,
      "is_unpublished": null,
      "id": "173560420"
    },
    { ... }
  ]
}
```

## GET /v1/instagram/profile

requires authentication · Endpoint weight: 1 · Fetch profile details such as bio, followers, and post count.

#### **Query Parameters**
**`username`** string   

Enter the username of the profile. Example: `simonthebutch`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/profile'
params = {
  'username': 'simonthebutch',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
    "meta": {
        "version": "v1.0",
        "status": 200,
        "copywrite": "https://steadyapi.com",
        "username": "mrbeast",
        "user_id": "2278169415"
    },
    "body": {
        "id": "2278169415",
        "username": "mrbeast",
        "full_name": "MrBeast",
        "is_verified": true,
        "is_private": false,
        "is_business": false,
        "profile_pic": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/31077884_211593632905749_1394765701385814016_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QH4MWqs44QWT-gl8Jy1aqGW85j5bBxIRkcr-4l0tvCRAp8GDdzPeqZT09Ca1gGv1Xafh13O1PZxVvAKwVJKEbQy&_nc_ohc=BQmIrdrjmzwQ7kNvwEapRRP&_nc_gid=6fEVcKejF9VdGyQ6W0nfqg&edm=AKralEIBAAAA&ccb=7-5&oh=00_AfmeA-1Z89vnccdlw89Ztei1oeYF5MNJmJ55gCLt1aJYDw&oe=6949630F&_nc_sid=2fe71f",
        "profile_pic_hd": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/31077884_211593632905749_1394765701385814016_n.jpg?efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QH4MWqs44QWT-gl8Jy1aqGW85j5bBxIRkcr-4l0tvCRAp8GDdzPeqZT09Ca1gGv1Xafh13O1PZxVvAKwVJKEbQy&_nc_ohc=BQmIrdrjmzwQ7kNvwEapRRP&_nc_gid=6fEVcKejF9VdGyQ6W0nfqg&edm=AKralEIBAAAA&ccb=7-5&oh=00_AfmQTVkan9bAL_zKLIVhjBHHtt4FeuJwkCTLi7-a67Wxrw&oe=6949630F&_nc_sid=2fe71f",
        "biography": "New MrBeast or MrBeast Gaming video every single Saturday at noon eastern time!",
        "external_url": "https://www.1billionsummit.com/mrbeast",
        "followers": 82126077,
        "following": 788,
        "posts": 422,
        "category": "",
        "account_type": 3,
        "has_videos": true,
        "has_guides": false,
        "has_music_on_profile": false,
        "profile_url": "https://www.instagram.com/mrbeast/",
        "mutual_followers_count": 0,
        "is_favorite": false
    }
}
```

## GET /v1/instagram/posts

requires authentication · Endpoint weight: 1 · Retrieve a user's posts, including images and videos.

#### **Query Parameters**
**`username`** string   

Enter the username to get all posts. Example: `simonthebutch`
**`pagination_token`** string _optional_   

Use the value from the previous request to paginate. Leave empty in the first request.

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/posts'
params = {
  'username': 'simonthebutch',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "pagination_token": "Mzc2NDYwNjAyMzkzNjgwMTQ4Ml8yMjc4MTY5NDE1IzIyNzgxNjk0MTU=",
    "count": 12
  },
  "body": [
    {
      "id": "3627347799613702778",
      "shortcode": "DJW7ZrwxQJ6",
      "media_type": 2,
      "product_type": "clips",
      "taken_at": 1746633748,
      "caption": "It’s my Birthday so I’m giving away $500,000 to my followers! Like and Comment on this post tagging 2 friends to enter! 10 people that do will win $50,000 each! Make sure you’re FOLLOWING so I can dm you if you win the money and share this to your story! Winners will be contacted in 14 days!\n\nAlso HUGE Thanks to @jacklinksjerky for making this happen, without them we can’t giveaway this money so please follow them as well!\n\nTerms and conditions apply, see official rules: \n\nhttps://bit.ly/MrB27IG",
      "like_count": 8413943,
      "comment_count": 7327981,
      "view_count": null,
      "reshare_count": 1131350,
      "media_url": "https://scontent-dfw5-1.cdninstagram.com/o1/v/t2/f2/m367/AQOEmEes7dnflSXIkcnlFc_BS7lW8UNb9ZLiymEeokytM02Rn6lf7-6PmKzgnVDMPdJFVtw88gA5KI2wBPABDSHOjrxX98N8VEglVMk.mp4?_nc_cat=111&_nc_sid=5e9851&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_ohc=r72cAFlaXukQ7kNvwEwec5E&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzIwLmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTMzMDE2MDMyODA2ODk4MCwiYXNzZXRfYWdlX2RheXMiOjIyNCwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjE3LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=jBrdMlM-BPZTPq9m8PtfYA&_nc_zt=28&vs=58c463ff819af3fc&_nc_vs=HBksFQIYQGlnX2VwaGVtZXJhbC9EOTQ1N0Q4OTBDOTI3QkRDMDRDNkE5REJBNjA2MjY4RF92aWRlb19kYXNoaW5pdC5tcDQVAALIARIAFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HQVZJaVIyWFpoeEZ1MDhFQU9JbEJRRmx0bllyYnFfRUFBQUYVAgLIARIAKAAYABsCiAd1c2Vfb2lsATEScHJvZ3Jlc3NpdmVfcmVjaXBlATEVAAAm6L3K3cLx3AQVAigCQzMsF0AxAAAAAAAAGBJkYXNoX2Jhc2VsaW5lXzFfdjERAHX-B2XmnQEA&oh=00_AfmRpRUyOoem7j6SPRwFYAJ8DIeItxocJbNegRChCOE3aQ&oe=69497360",
      "thumbnail_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.75761-15/495950972_18472568746073416_3105750293122405818_n.jpg?stp=dst-jpg_e15_s640x640_tt6&_nc_cat=1&ig_cache_key=MzYyNzM0Nzc5OTYxMzcwMjc3ODE4NDcyNTY4NzQzMDczNDE2.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjUzNDZ4OTUwNC5zZHIuQzMifQ%3D%3D&_nc_ohc=yqdF35_1_OsQ7kNvwHkhO5X&_nc_oc=AdlNg1OxQokz9vEVIgqQbLBZNeqgLDo_-FMwvmKd3ZjVL01b49IOHbP394NdRvL-4BPKin5rJQAubi1Zpbgg2MBk&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=jBrdMlM-BPZTPq9m8PtfYA&oh=00_AfkhgYOzuHldmpPR8ewd8mQvPLurGW2OG4NqwffhSv67iw&oe=69496971",
      "width": 720,
      "height": 1280,
      "has_audio": true,
      "is_paid_partnership": false,
      "user": {
        "id": "2278169415",
        "username": "mrbeast",
        "is_verified": true,
        "profile_pic": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/31077884_211593632905749_1394765701385814016_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QHL5hXroJs81cWdDpo4PVGqnMl0W7oOLAYDH_oKCpjQ5y-B27mpxIJTc5EbvMcRIK6bl4HFjAhnjJDQFUlL-Suc&_nc_ohc=BQmIrdrjmzwQ7kNvwEapRRP&_nc_gid=jBrdMlM-BPZTPq9m8PtfYA&edm=ABmJApABAAAA&ccb=7-5&oh=00_AfmsEMERJzY-EAwoKmj4NGsMt9laR5FF8wwHP_m_INIXyQ&oe=6949630F&_nc_sid=b41fef"
      },
      "permalink": "https://www.instagram.com/p/DJW7ZrwxQJ6/"
    },
    { ... }
  ]
}
```

## GET /v1/instagram/following

requires authentication · Endpoint weight: 1 · Get a list of accounts the user is following.

#### **Query Parameters**
**`username`** string   

Enter the username to get a list of accounts the user is following. Example: `simonthebutch`
**`pagination_token`** string _optional_   

Use the value from the previous request to paginate. Leave empty in the first request.

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/following'
params = {
  'username': 'simonthebutch',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "pagination_token": "25"
  },
  "body": [
    {
      "pk": "7805930",
      "pk_id": "7805930",
      "id": "7805930",
      "username": "jerrylorenzo",
      "full_name": "JERRY LORENZO",
      "is_private": false,
      "fbid_v2": "17841401857900121",
      "third_party_downloads_enabled": 1,
      "strong_id__": "7805930",
      "profile_pic_id": "3538405871405538041_7805930",
      "profile_pic_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-19/472777022_1027463679144374_1338437299647625855_n.jpg?stp=dst-jpg_e0_s150x150_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2AGU6gTarEniKY53JRvyVvzJZrmldF4PtLhoSRAnv4gcshv2aMCSGijdbC-XWmnKnVo90JXz-e4ISOon5FfqFVFi&_nc_ohc=ly0QZbeTMRwQ7kNvgFb9CH3&_nc_gid=3c46286831e04da68242690abe3ada63&edm=ALB854YBAAAA&ccb=7-5&oh=00_AYBIC62erSyqMPM18kK8cQdCogAs_E5d6wI75I0h8De0Vg&oe=67BED4B9&_nc_sid=ce9561",
      "is_verified": true,
      "has_anonymous_profile_picture": false,
      "account_badges": [],
      "latest_reel_media": 1740154270,
      "is_favorite": false
    },
    { ... }
  ]
}
```

## GET /v1/instagram/followers

requires authentication · Endpoint weight: 1 · Retrieve a list of the user’s followers.

#### **Query Parameters**
**`username`** string   

Enter the username to get a list of the user’s followers. Example: `simonthebutch`
**`pagination_token`** string _optional_   

Use the value from the previous request to paginate. Leave empty for the first request. If null, the account's followers are restricted.

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/followers'
params = {
  'username': 'simonthebutch',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "pagination_token": "MTAjNjdkYjY4MmVlYThhNDM2Njk5ODVjNWQ2MWYxYWI3MWZ8NzY1MzgwODgzNjh8b3NyIzcyODIwNDEzODMw"
  },
  "body": [
    {
      "pk": "76640732118",
      "pk_id": "76640732118",
      "id": "76640732118",
      "full_name": "roshan_priyanka12",
      "fbid_v2": "17841476683550091",
      "third_party_downloads_enabled": 0,
      "strong_id__": "76640732118",
      "profile_pic_id": "3701902529747759290_76640732118",
      "profile_pic_url": "https://scontent-hou1-1.cdninstagram.com/v/t51.2885-19/535282022_17844242361556119_8844125840494848554_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-hou1-1.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGvXKRPVLMkdH5kxacx7QDTESqyAQSY3ZY2RzjVTF9gqCkFAaBApkZMUUf-Lc-BwcA&_nc_ohc=2DrBOE5H_YcQ7kNvwHezNRX&_nc_gid=bxcU46K69krBvTW5aDUFSw&edm=APQMUHMBAAAA&ccb=7-5&oh=00_Afet6_FOnzADxwuQPZJSTdyN1bFcured-Z3KcwDW1_NtRg&oe=68E61F8A&_nc_sid=6ff7c8",
      "is_verified": false,
      "username": "roshan_priyanka12",
      "is_private": false,
      "has_anonymous_profile_picture": false,
      "account_badges": [],
      "latest_reel_media": 0
    },
    { ... }
  ]
}
```

## GET /v1/instagram/highlights

requires authentication · Endpoint weight: 1 · Retrieve a list of the user’s highlights.

#### **Query Parameters**
**`username`** string   

Enter the user_id or username to get a list of the user’s highlights. Example: `simonthebutch`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/highlights'
params = {
  'username': 'simonthebutch',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "username": "2278169415",
    "count": 9
  },
  "body": [
    {
      "id": "highlight:17929440964811872",
      "title": "Operation Chad",
      "created_at": 1638393333,
      "updated_at": 1754706856,
      "media_count": 14,
      "is_pinned": false,
      "is_archived": false,
      "cover": {
        "media_id": "2719200566406473491_2278169415",
        "url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-15/555003756_18043662608392639_57526329583388619_n.jpg?stp=c0.455.1170.1170a_dst-jpg_e15_s150x150_tt6&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2QHfVZbN7BiXWbp_I39ozuaav1mu0ZrYdCjGdztlkE05WbB3IM6IPoczHvthmxiev8-FO1On13cSGQtEV0oZ5yFo&_nc_ohc=uyaMwiLteLIQ7kNvwFftCZ9&_nc_gid=6jBmSVnAAHT0sGIE5UYwbg&edm=ALbqBD0BAAAA&ccb=7-5&oh=00_AfnqVnn6zeig57mzNgW6h4jVIHnkAfDZXTjv5pqqis0PjQ&oe=69495E98&_nc_sid=847350",
        "width": 150,
        "height": 150
      },
      "latest_reel_media": 1754706822,
      "can_reply": true,
      "can_reshare": true,
      "user": {
        "id": "2278169415",
        "username": "mrbeast",
        "full_name": "MrBeast",
        "profile_pic_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/31077884_211593632905749_1394765701385814016_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby41MDAuYzIifQ&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QHfVZbN7BiXWbp_I39ozuaav1mu0ZrYdCjGdztlkE05WbB3IM6IPoczHvthmxiev8-FO1On13cSGQtEV0oZ5yFo&_nc_ohc=BQmIrdrjmzwQ7kNvwEapRRP&_nc_gid=6jBmSVnAAHT0sGIE5UYwbg&edm=ALbqBD0BAAAA&ccb=7-5&oh=00_Afl7rK5D9Eg8n47pARJby6s7xR90cJvS8-t4uRq5oO3kVQ&oe=6949630F&_nc_sid=847350",
        "is_verified": true
      }
    },
    { ... }
  ]
}
```

## GET /v1/instagram/info

requires authentication · Endpoint weight: 1 · Retrieve details about a specific post, including captions and media.

#### **Query Parameters**
**`code`** string   

Enter the code from the post URL that comes after /p/ or /reel/ or /tv/. Example: `DESoQn4RgAl`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/info'
params = {
  'code': 'DESoQn4RgAl',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "media_id": "3572357542028525892",
    "shortcode": "DGTkEHfTEFE"
  },
  "body": {
    "id": "3572357542028525892",
    "shortcode": "DGTkEHfTEFE",
    "media_type": 8,
    "product_type": "carousel_container",
    "taken_at": 1740078226,
    "caption": "Martin Scorsese is set to direct a new crime thriller featuring Dwayne Johnson, Leonardo DiCaprio, and Emily Blunt. \n\nThe film, set in 1960s and ’70s Hawaii, follows an aspiring mob boss battling rival crime factions for control of the Hawaiian underworld. Johnson and Blunt, who previously collaborated on “Jungle Cruise,” brought the story to Scorsese and DiCaprio. Journalist and documentary filmmaker Nick Bilton has been hired to write the screenplay. ￼\n\n-\n#dwaynejohnson #filmseal",
    "like_count": 6426,
    "comment_count": 176,
    "view_count": null,
    "width": 1080,
    "height": 1350,
    "thumbnail_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.75761-15/481150263_18154675132352463_2551936830351800786_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzU3MjM1NzUzMzAzNjA2OTQ5OQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=7LeYrdF5ntcQ7kNvwETJurw&_nc_oc=AdlK9exmAX_gmtzi0uI1znVfm44IVtyfsR-eUHH-g78nz42gePhfRAI5H5pkiZcMNt3tqN1IOzk-aqN0tD0358MM&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&se=7&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=Rq7ZVMU_qRvVMZ8JI3CdDQ&oh=00_Afmo9kxwiQnDRo9eAx6e98kMWmIBHUyljnl-QWSnR0UfbQ&oe=6949946B",
    "media_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.75761-15/481150263_18154675132352463_2551936830351800786_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzU3MjM1NzUzMzAzNjA2OTQ5OQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=7LeYrdF5ntcQ7kNvwETJurw&_nc_oc=AdlK9exmAX_gmtzi0uI1znVfm44IVtyfsR-eUHH-g78nz42gePhfRAI5H5pkiZcMNt3tqN1IOzk-aqN0tD0358MM&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&se=7&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=Rq7ZVMU_qRvVMZ8JI3CdDQ&oh=00_Afmo9kxwiQnDRo9eAx6e98kMWmIBHUyljnl-QWSnR0UfbQ&oe=6949946B",
    "permalink": "https://www.instagram.com/p/DGTkEHfTEFE/",
    "user": {
      "id": "10630816462",
      "username": "filmseal",
      "full_name": "FilmSeal",
      "profile_pic_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.2885-19/497078704_18162418186352463_201285262071392505_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_cat=1&_nc_oc=Q6cZ2QFufyst2HpB9DM3pYMBKyI7_npLw3LfF2Vc6ks-5oBAl5dSef224lYP0T_AtiNw66wViMCYZBbT8cC630sMDkgO&_nc_ohc=5l9vONwXabQQ7kNvwGba4K6&_nc_gid=Rq7ZVMU_qRvVMZ8JI3CdDQ&edm=ALQROFkBAAAA&ccb=7-5&oh=00_Afl5KZuZ6ofT9oOUu4t2OiWBKAWEEH7ZO9FP6F0bTIqUGg&oe=69496B83&_nc_sid=fc8dfb",
      "is_verified": true,
      "is_private": false,
      "follower_count": null
    },
    "location": null,
    "music": {
      "title": null,
      "artist": null
    },
    "carousel_media": [
      {
        "media_type": 1,
        "width": 1080,
        "height": 1350,
        "media_url": "https://scontent-dfw5-1.cdninstagram.com/v/t51.75761-15/481150263_18154675132352463_2551936830351800786_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzU3MjM1NzUzMzAzNjA2OTQ5OQ%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=7LeYrdF5ntcQ7kNvwETJurw&_nc_oc=AdlK9exmAX_gmtzi0uI1znVfm44IVtyfsR-eUHH-g78nz42gePhfRAI5H5pkiZcMNt3tqN1IOzk-aqN0tD0358MM&_nc_ad=z-m&_nc_cid=1087&_nc_zt=23&se=7&_nc_ht=scontent-dfw5-1.cdninstagram.com&_nc_gid=Rq7ZVMU_qRvVMZ8JI3CdDQ&oh=00_Afmo9kxwiQnDRo9eAx6e98kMWmIBHUyljnl-QWSnR0UfbQ&oe=6949946B"
      },
      { ... }
    ],
    "is_paid_partnership": false,
    "is_carousel": true
  }
}
```

## GET /v1/instagram/comments

requires authentication · Endpoint weight: 1 · Get comments on a post, including threading support.

#### **Query Parameters**
**`code`** string   

Enter the code or pk from the post URL to get the comments. Example: `DESoQn4RgAl`
**`pagination_token`** string _optional_   

Use the value from the previous request to paginate. Leave empty in the first request.

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/comments'
params = {
  'code': 'DESoQn4RgAl',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "pagination_token": "eyJjYWNoZWRfY29tbWVudHNfY3Vyc29yIjogIjE4MDM4NjAzMzkzNjA0Nzg5IiwgImJpZmlsdGVyX3Rva2VuIjogIktIRUFDX2YtcTE4X1FBQXJQdFZpQmdoQUFJMlVNR0dGeHo4QVRvbkprY0FNUUFBUFNZcEdOeUJBQUM4Z0NTNDJsejhBMENRZTQxVlZRQUN0SUtlQ05ldEFBTmFobjVWRWNqOEF0b0ZnaTJDS1FBQzJ2aHVSZENoQUFObDJXaU9iYWo4QUdpMERmakFsUUFEY3Vwc2hJeXhBQUFBPSJ9"
  },
  "body": [
    {
      "id": "18062927908813532",
      "text": "The departed meets goodfellas meets forgetting Sarah Marshall",
      "created_at": 1741887385,
      "like_count": 0,
      "has_liked": false,
      "is_pinned": false,
      "reply_count": 0,
      "user": {
        "id": "2207887249",
        "username": "pmayer988",
        "full_name": "Peter Mayer",
        "profile_pic_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-19/435066855_996735265177236_3095045788177724691_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=100&_nc_oc=Q6cZ2QGRW9BVDNhejbe7ZatdCrBseg98xgLShxFPaYoPZOuv39SOHfEXwNAwrx6RlWnkA5ltgAHhao0bekQBC_wpDMQ0&_nc_ohc=DqdnXMOzhTcQ7kNvwHvwE8-&_nc_gid=5iIBastoe5JID7ckcQADGA&edm=AId3EpQBAAAA&ccb=7-5&oh=00_AfmuECxBcSe5U8pEt3x8zx4ewwXhveq9Z6exxqYqfKkzrg&oe=69497B15&_nc_sid=f5838a",
        "is_verified": false,
        "is_private": true
      }
    },
    { ... }
  ]
}
```

## GET /v1/instagram/related-posts

requires authentication · Endpoint weight: 1 · Get related posts based on a source post.

#### **Query Parameters**
**`code`** string   

The shortcode from the post URL to get related posts. Example: `DMtRvk_IKx2`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/related-posts'
params = {
  'code': 'DMtRvk_IKx2',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
    "meta": {
      "version": "v1.0",
      "status": 200,
      "copywrite": "https://steadyapi.com",
      "count": 9,
      "returned_count": 9,
      "source_media": "DGTkEHfTEFE"
    },
    "body": [
      {
        "id": "3687681706206211190",
        "shortcode": "DMtRvk_IKx2",
        "media_type": 8,
        "product_type": "carousel_container",
        "taken_at": null,
        "caption_preview": "Love this film 🤣\n\nWhile the end credits photos are genuine, they were also taken in Las Vegas dur...",
        "like_count": 652319,
        "comment_count": 871,
        "thumbnail_url": "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/524710465_18169874368352463_4001037960635213249_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ig_cache_key=MzY4NzY4MTY5MDIyNTk3NTQzMg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=LXQ43N2hvPEQ7kNvwGo2D6I&_nc_oc=AdkTlpxk0exQG5wQLdjpSUEoy_Kh2QShKXT4SD2TbN5NwvIQyF49NvwPR4HTHF2DM_I&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=OBsovhyIvy-XoRQnZoVU5A&_nc_ss=8&oh=00_AfzkNVaN2oGzOCZzsFJO4ICMXeIOAZWSVsxaDNcx-kd7hw&oe=69B99892",
        "display_url": "https://scontent-iad3-2.cdninstagram.com/v/t51.82787-15/524710465_18169874368352463_4001037960635213249_n.jpg?stp=c0.135.1080.1080a_dst-jpg_e15_fr_s1080x1080_tt6&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QHLoKEhUFE_MeY8Zie2AUADzZYdIdQZeNuU9T53bJVnYtUTMcgLp0L4XYUkhaXHZjQ&_nc_ohc=bX6GRABwjysQ7kNvwGucO3O&_nc_gid=OBsovhyIvy-XoRQnZoVU5A&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfwwNZmxTKcMsd6nRvTFD6vqwdkafGGmE8BQT1WtKEkE6w&oe=69B99892&_nc_sid=10d13b",
        "carousel_media_count": 7,
        "carousel_previews": [
          "https://scontent-iad3-1.cdninstagram.com/v/t51.82787-15/524710465_18169874368352463_4001037960635213249_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ig_cache_key=MzY4NzY4MTY5MDIyNTk3NTQzMg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=LXQ43N2hvPEQ7kNvwGo2D6I&_nc_oc=AdkTlpxk0exQG5wQLdjpSUEoy_Kh2QShKXT4SD2TbN5NwvIQyF49NvwPR4HTHF2DM_I&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-1.cdninstagram.com&_nc_gid=OBsovhyIvy-XoRQnZoVU5A&_nc_ss=8&oh=00_AfzkNVaN2oGzOCZzsFJO4ICMXeIOAZWSVsxaDNcx-kd7hw&oe=69B99892",
          "https://scontent-iad3-2.cdninstagram.com/v/t51.82787-15/525620275_18169874365352463_1055116411672707943_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=111&ig_cache_key=MzY4NzY4MTY5MDIwOTM0ODE4OA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=0T0-RWWAThgQ7kNvwFWVuEN&_nc_oc=AdmPQi2opskS0KYO3ZGNYEANqL_-awxL3LdDQYcLcTea1fbnsTRcIgBlN3CqZFelRdE&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_gid=OBsovhyIvy-XoRQnZoVU5A&_nc_ss=8&oh=00_Afyi1Xd0VGW8LiZUK0Ml1gRWUONqSAl0w93WFtW6YLDv9w&oe=69B97D5F",
          "https://scontent-iad3-2.cdninstagram.com/v/t51.82787-15/524700682_18169874377352463_1737439578037666689_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=105&ig_cache_key=MzY4NzY4MTY5MDIyNjA5MTQ1Mw%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTM1MC5zZHIuQzMifQ%3D%3D&_nc_ohc=-rTjOLBzEpoQ7kNvwHXrWfO&_nc_oc=AdngWvUaCrf4t3CVlIvNkuLnzb5JQVDfRTcweMdH25dPzsCseRJjEqjrmTMyH_HBSuw&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_gid=OBsovhyIvy-XoRQnZoVU5A&_nc_ss=8&oh=00_AfyW8Lbg-mQ-AkLlnLKc_4pQOY5cVr8chgQMXyvEujk5hw&oe=69B9A7C0"
        ],
        "user": {
          "id": "10630816462",
          "username": "filmseal"
        },
        "permalink": "https://www.instagram.com/p/DMtRvk_IKx2/"
      },
      { ... }
    ]
  }
```

## GET /v1/instagram/likes

requires authentication · Endpoint weight: 1 · Fetch users who have liked a specific post.

#### **Query Parameters**
**`code`** string   

Enter the code from the post URL to get the likes. Example: `DESoQn4RgAl`

Example request (Python):
```python
import requests
import json

url = 'https://api.steadyapi.com/v1/instagram/likes'
params = {
  'code': 'DESoQn4RgAl',
}
headers = {
  'Authorization': 'Bearer {YOUR_AUTH_KEY}'
}

response = requests.request('GET', url, headers=headers, params=params)
response.json()
```

Example response (200):
```json
{
  "meta": {
    "version": "v1.0",
    "status": 200,
    "copywrite": "https://steadyapi.com",
    "pagination_token": "ZWI4MDhlNDY5ODgwNDEwOWJhNmM0ZmM0YTQ4ZWIzN2R8NzMzNzcyNTg3MDR8b3Ny",
    "total_users": 6426
  },
  "body": [
    {
      "id": "46054680327",
      "username": "asport2008",
      "full_name": "",
      "profile_pic_url": "https://scontent-dfw5-2.cdninstagram.com/v/t51.2885-19/412418889_7148859175176650_5619787394340534433_n.jpg?stp=dst-jpg_e0_s150x150_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-dfw5-2.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2QHDHOmE-_e9hLHuIedPG88iDE3yMQ_feXli2vJAajqsoI22YqIrTMt_kn4FKUytDtZwDIVfmkFJebr0frnmKdfD&_nc_ohc=qTpQcAG7MOEQ7kNvwGxrJ4O&_nc_gid=LTfulFJdc2mX_LookO4iLA&edm=APwHDrQBAAAA&ccb=7-5&oh=00_Afl1HscUeNVnpiJhpmuKhP7vWPCvzvKNUVKazaobKgykWg&oe=6949712F&_nc_sid=8809c9",
      "is_verified": false,
      "is_private": false,
      "latest_reel_media": 0
    },
    { ... }
  ]
}
```

---

# Cross-social: what else SteadyAPI gives us (same key, same envelope, same auth)

Full docs sections on https://docs.steadyapi.com/ beyond Instagram — inventoried 07/05/2026. All follow the same Bearer-auth + `meta`/`body` envelope. Pagination on Twitter/Reddit uses a `cursor` param (returned in meta) instead of Instagram's `pagination_token`.

## 🐦 Twitter Social — 15 endpoints (`/v1/twitter/...`)

Search & discovery:
- `GET /v1/twitter/search` (weight 1) — search users, tweets, topics. Params: `search`, `count?`, `cursor?`, `type?`
- `GET /v1/twitter/trends` (weight 1) — trending topics for a location. Params: `woeid?`
- `GET /v1/twitter/tweet/info` — detailed info for a single tweet. Params: `id`
- `GET /v1/twitter/woeid` (weight 1) — full global WOEID (location id) data. No params.

User:
- `GET /v1/twitter/user` — detailed user profile. Params: `username`
- `GET /v1/twitter/user/followers` — paginated followers. Params: `username`, `count?`, `cursor?`
- `GET /v1/twitter/user/following` — accounts a user follows. Params: `username`, `count?`, `cursor?`
- `GET /v1/twitter/user/tweets` — a user's tweets. Params: `user_id`, `count?`, `cursor?`
- `GET /v1/twitter/user/replies` — tweets + replies. Params: `user_id`, `count?`, `cursor?`
- `GET /v1/twitter/user/highlights` — highlight tweets. Params: `user_id`, `count?`, `cursor?`

Lists:
- `GET /v1/twitter/list/search` — search public lists. Params: `search`, `count?`, `cursor?`
- `GET /v1/twitter/list/details` — list details. Params: `list_id`
- `GET /v1/twitter/list/timeline` — tweets from a list. Params: `list_id`, `count?`, `cursor?`
- `GET /v1/twitter/list/followers` — users following a list. Params: `list_id`, `count?`, `cursor?`
- `GET /v1/twitter/list/members` — list members. Params: `list_id`, `count?`, `cursor?`

Note: user timeline endpoints take `user_id` (numeric), not username — resolve via `/v1/twitter/user` first.

### Twitter quirks — field-verified, not in the crawled docs

**07/08/2026 (24 real calls):**
- **`/v1/twitter/search` returns an ENTITY object, NOT tweet bodies.** `body` is
  `{ users, topics, events, lists }` — regardless of the `type` param. Values tried
  (`Top`/`Latest`/`tweets`/`Tweets`/`People`/`Media`) ALL yielded the same entity object; none returned an
  array of tweets. So the docs' "search users, tweets, topics" wording overstates it — you get matching
  *accounts/topics/events/lists*, not tweet text or tweet URLs. To actually read tweets: resolve an account
  via `/v1/twitter/user` → numeric `user_id`, then `/v1/twitter/user/tweets`. For a keyword content sweep,
  Twitter is a two-hop endpoint, not one.

## 🗨️ Reddit — 9 endpoints (`/v1/reddit/...`)

- `GET /v1/reddit/search` (weight 1) — search topics; filter by posts/comments/users/communities; sort by relevant/hot/new/rising + time frame. Params: `search`, `subreddit?`, `filter?`, `cursor?`
- `GET /v1/reddit/posts` (weight 2) — hot/new/top posts from a subreddit URL. Params: `url`, `cursor?`
- `GET /v1/reddit/post` (weight 1) — one post's content, upvotes, comments. Params: `url`
- `GET /v1/reddit/subreddit/popular` (weight 1) — popular subreddits. Params: `cursor?`
- `GET /v1/reddit/subreddit/info` — subreddit info. Params: `subreddit?`
- `GET /v1/reddit/subreddit/new` (weight 1) — new subreddits. Params: `cursor?`
- `GET /v1/reddit/subreddit/comments` (weight 1) — latest comments from a subreddit. Params: `subreddit`, `cursor?`
- `GET /v1/reddit/user-stats` (weight 1) — public user stats (total/post/comment/awarder/awardee karma, account metadata). Params: `username`
- `GET /v1/reddit/user-data` (weight 2) — a user's posts + comments, sortable hot/top/new. Params: `username?`, `filter?`

### Reddit quirks — field-verified, not in the crawled docs

**07/05/2026 (39 real calls):**
- `/v1/reddit/search`'s `filter` param REJECTS the value `posts` (422/error) even though it looks
  documented; `subreddit:` query syntax also breaks the endpoint.
- The `subreddit` param on `/v1/reddit/search` must be a bare name and only BIASES site-wide relevance
  ranking — it does not hard-filter. Client-side filtering by subreddit is required for scoped mining.
- `/v1/reddit/post` responds with `body.post` + `body.post_comments[]` with nested `replies`.

**07/08/2026 (20 real calls):**
- `/v1/reddit/search`'s `filter` param is content-sensitive, not just value-sensitive: 2 of 14
  identical-shaped queries ("claude ai prompting hacks", "claude code subagents workflow") returned
  HTTP 200 with `{"success": false, "message": "Please enter a valid subReddit URL."}` — no subreddit
  syntax was in either query. Rewording the same query slightly succeeded immediately. **Always check
  `body.success !== false` even on HTTP 200** — this endpoint can 200 with no real results.
- `/v1/reddit/posts` (hard subreddit targeting via `url=`) needs a DIFFERENT `filter` enum than
  `/search`: valid values are `hot | new | top | rising`. The `/search` filter values
  (`posts`/`comments`/`users`/`communities`) all 422 here ("The selected filter is invalid."). Omitting
  both `filter` and `sortType` 422s ("filter field is required when sort type is not present").
- `filter=top` alone on `/v1/reddit/posts` returns only ~3 items (short default window, likely "past
  hour"); `filter=hot`, `filter=new`, and `filter=rising` each reliably return a full 25-item page. Use
  `hot` for a representative subreddit snapshot.
- `sortType` could not be made to work in combination with `filter` on `/v1/reddit/posts` — every value
  tried (`all/year/month/week/day/hour`) 422'd ("The selected sort type is invalid"). Valid values
  remain unconfirmed; don't rely on it — use bare `filter=hot` instead.

**07/08/2026 (later, 34 real calls — AI-design/email sweep):**
- The content-sensitive `/search` 200-with-`{"success": false, "message": "Please enter a valid subReddit
  URL."}` behavior reproduced a THIRD independent time — this run it hit `midjourney marketing` and
  `AI subject line` (neither has subreddit syntax); rewording succeeded. Treat as a stable vendor-side
  content-filter false-positive, not intermittent. `body.success !== false` is a mandatory guard.
- Same run confirmed generic `/search` relevance-ranks **site-wide**, not by topic: bucketed queries about
  AI design / email marketing returned mostly unrelated viral posts (layoffs, model releases, IPOs). For
  scoped mining, targeted `/v1/reddit/posts?url=<subreddit>&filter=hot` + client-side filtering is the
  reliable path; generic `/search` is low-yield for niche topics.

## 🤖 ScrapeFlow — generic scraper

- `POST /v1/scraper` — SteadyAPI's general-purpose scraping endpoint (their "ScrapeFlow" product). Fallback lane for social surfaces they don't have dedicated endpoints for (e.g. TikTok, Facebook, LinkedIn — none of which have dedicated SteadyAPI sections as of 07/05/2026).

## Other SteadyAPI sections (same key — not social, listed for awareness)

Stocks & Options · Crypto · Real Estate (we already use this — see `lib/listings/steadyapi.ts`, `ingest/pipelines/*/steady_client.py`) · Hockey (NHL) · Baseball (MLB) · Booking.com · Amazon · AutoHub · Aliexpress.

## Reusable patterns across all socials (build notes)

1. One client, per-surface prefix: auth, envelope parsing, error mapping (401/403/404/422/429), and retry/backoff are identical across instagram/twitter/reddit — mirror the existing `steady_client.py` pattern rather than writing per-surface clients.
2. Pagination differs by surface: Instagram = `pagination_token` (15-min expiry, 20 req/15 min session cap — walk fast or restart); Twitter/Reddit = `cursor` + optional `count`.
3. Media URLs from Instagram CDN expire — rehost before embedding in deliverables.
4. `shortcode` is the universal Instagram post key: permalink `instagram.com/p/<shortcode>/` ↔ `code` param on info/comments/likes/related-posts.
5. Weights ≠ requests: budget quota by weight (IG post search = 2, Reddit posts/user-data = 2, most others = 1).
6. Engagement metrics come as raw counts (`like_count`, `comment_count`, `view_count`, `reshare_count`, karma) — usable directly as cited figures with SteadyAPI as the lane-1/lane-3 source; never surface the vendor name in product output.
