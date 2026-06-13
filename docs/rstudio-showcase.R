# ── SWFL Data Gulf — RStudio Showcase Dashboard ─────────────────────────────
# 4-panel intelligence dashboard from ZIP-level SWFL data
# install.packages(c("ggplot2","dplyr","scales","patchwork","ggrepel"))

library(ggplot2)
library(dplyr)
library(scales)
library(patchwork)
library(ggrepel)

# ── Representative ZIP-level data (mirrors live API grain) ───────────────────
df <- data.frame(
  zip   = c("33931","34102","34119","34134","33907","33912","33919","33990","33993","34120"),
  place = c("Ft Myers Beach","Naples Core","Naples North","Bonita Springs",
            "Fort Myers","Fort Myers SW","Cape Coral W","Cape Coral E","Cape Coral NW","Naples East"),
  home_value    = c(820000, 950000, 620000, 540000, 310000, 380000, 295000, 270000, 255000, 440000),
  median_rent   = c(2800, 3200, 2400, 2100, 1750, 1900, 1650, 1580, 1540, 2050),
  flood_aal     = c(30074, 4200,  980, 2100,  450,  820, 1200,  380,  290,  760),
  permit_growth = c(-8, 12, 18, 22, 5, 9, 14, 11, 16, 25),
  county        = c("Lee","Collier","Collier","Lee","Lee","Lee","Lee","Lee","Lee","Collier")
)

# ── Shared dark theme ────────────────────────────────────────────────────────
theme_swfl <- function() {
  theme_minimal(base_size = 11) +
    theme(
      plot.background   = element_rect(fill = "#0f172a", color = NA),
      panel.background  = element_rect(fill = "#1e293b", color = NA),
      panel.grid.major  = element_line(color = "#334155", linewidth = 0.4),
      panel.grid.minor  = element_blank(),
      text              = element_text(color = "#e2e8f0"),
      axis.text         = element_text(color = "#94a3b8", size = 8),
      axis.title        = element_text(color = "#cbd5e1", size = 9),
      plot.title        = element_text(color = "#f8fafc", face = "bold", size = 11),
      plot.subtitle     = element_text(color = "#64748b", size = 8),
      legend.background = element_rect(fill = "#1e293b", color = NA),
      legend.text       = element_text(color = "#94a3b8", size = 8),
      legend.title      = element_text(color = "#cbd5e1", size = 8)
    )
}

pal <- c("Lee" = "#38bdf8", "Collier" = "#a78bfa")

# ── Panel 1: Median Home Value ───────────────────────────────────────────────
p1 <- df |>
  mutate(place = reorder(place, home_value)) |>
  ggplot(aes(home_value, place, fill = county)) +
  geom_col(width = 0.7) +
  scale_x_continuous(labels = label_dollar(scale = 1e-3, suffix = "K")) +
  scale_fill_manual(values = pal) +
  labs(title = "Median Home Value by ZIP",
       subtitle = "ZHVI · Lee + Collier FL",
       x = NULL, y = NULL, fill = NULL) +
  theme_swfl()

# ── Panel 2: Median Monthly Rent ─────────────────────────────────────────────
p2 <- df |>
  mutate(place = reorder(place, median_rent)) |>
  ggplot(aes(median_rent, place, fill = county)) +
  geom_col(width = 0.7) +
  scale_x_continuous(labels = label_dollar()) +
  scale_fill_manual(values = pal) +
  labs(title = "Median Monthly Rent by ZIP",
       subtitle = "ZORI · Lee + Collier FL",
       x = NULL, y = NULL, fill = NULL) +
  theme_swfl()

# ── Panel 3: Flood Risk vs. Home Value ───────────────────────────────────────
p3 <- df |>
  ggplot(aes(flood_aal, home_value, size = median_rent, color = county, label = place)) +
  geom_point(alpha = 0.85) +
  geom_text_repel(size = 2.5, color = "#e2e8f0", max.overlaps = 10,
                  segment.color = "#475569", segment.size = 0.3) +
  scale_x_continuous(labels = label_dollar(), name = "Avg Annual Flood Loss (AAL, $)") +
  scale_y_continuous(labels = label_dollar(scale = 1e-3, suffix = "K"), name = "Median Home Value") +
  scale_size_continuous(range = c(3, 10), guide = "none") +
  scale_color_manual(values = pal) +
  labs(title = "Flood Risk vs. Home Value",
       subtitle = "Bubble size = median rent  ·  The moat: no other source combines these",
       color = NULL) +
  theme_swfl()

# ── Panel 4: Permit Growth YoY (diverging) ───────────────────────────────────
p4 <- df |>
  mutate(place    = reorder(place, permit_growth),
         trending = permit_growth >= 0) |>
  ggplot(aes(permit_growth, place, fill = trending)) +
  geom_col(width = 0.7) +
  geom_vline(xintercept = 0, color = "#94a3b8", linewidth = 0.5) +
  scale_x_continuous(labels = function(x) paste0(ifelse(x > 0, "+", ""), x, "%")) +
  scale_fill_manual(values = c("TRUE" = "#22c55e", "FALSE" = "#ef4444"), guide = "none") +
  labs(title = "Building Permit Growth YoY",
       subtitle = "Lee + Collier FL  ·  sourced from county permit portals",
       x = NULL, y = NULL) +
  theme_swfl()

# ── Compose ──────────────────────────────────────────────────────────────────
dashboard <- (p1 | p2) / (p3 | p4) +
  plot_annotation(
    title    = "SWFL Data Gulf  —  Intelligence Dashboard",
    subtitle = "swfldatagulf.com  ·  ZIP-level  ·  Lee + Collier FL  ·  15+ live data sources",
    theme    = theme(
      plot.background = element_rect(fill = "#0f172a", color = NA),
      plot.title      = element_text(color = "#f8fafc", face = "bold", size = 16, hjust = 0.5),
      plot.subtitle   = element_text(color = "#64748b", size = 10, hjust = 0.5),
      plot.margin     = margin(16, 16, 16, 16)
    )
  )

print(dashboard)
