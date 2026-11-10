import { z } from "zod";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
export const officialUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.centralbank.go.ke" &&
      !url.username &&
      !url.password
    );
  });
export const bondReferenceSchema = z
  .object({
    issueNumber: z.string().regex(/^(?:IFB|FXD)\d+\/\d{4}\/\d{1,3}$/),
    isin: z.string().regex(/^KE[A-Z0-9]{10}$/),
    name: z.string().min(1).max(160),
    aliases: z.array(z.string().max(160)).max(20),
    issuer: z.literal("Republic of Kenya"),
    currency: z.literal("KES"),
    instrumentType: z.enum(["infrastructure", "treasury"]),
    couponPercent: z.number().min(0).max(100).optional(),
    couponType: z.enum(["fixed", "floating", "zero"]).optional(),
    paymentsPerYear: z.number().int().min(1).max(12).optional(),
    taxPercent: z.number().min(0).max(100).optional(),
    issueDate: date.optional(),
    tenor: z.number().positive().max(100).optional(),
    maturity: date.optional(),
    couponDates: z.array(date).max(300),
    scheduleStatus: z.enum(["published-partial", "unavailable"]),
    amortisation: z
      .array(
        z
          .object({
            date,
            percentOfOutstanding: z.number().positive().max(100),
          })
          .strict(),
      )
      .max(50),
    finalRedemptionPercentOfOutstanding: z
      .number()
      .positive()
      .max(100)
      .optional(),
    redemptionConditions: z.string().max(2000).optional(),
    sourceUrl: officialUrl,
    prospectusUrl: officialUrl.optional(),
    publicationDate: date.optional(),
    verifiedAt: z.string().datetime(),
    retrievedAt: z.string().datetime(),
    verification: z.enum(["official-listing", "prospectus-reviewed"]),
    sourceMetadata: z.string().max(2000),
  })
  .strict();
export type BondReference = z.infer<typeof bondReferenceSchema>;
