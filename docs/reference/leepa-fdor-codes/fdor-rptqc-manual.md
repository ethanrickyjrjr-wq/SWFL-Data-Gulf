# Florida DOR â€” Real Property Transfer Qualification Code (RPTQC) Training Manual

Source: https://floridarevenue.com/property/Documents/RPTQC_Manual.pdf
Publisher: Florida Department of Revenue, Property Tax Oversight
Document date: October 2025
Fetched: 07/20/2026

Explains the statewide QUAL_CD1 / QUAL_CD2 sale-transfer-qualification codes already
pulled by ingest/pipelines/lee_parcels and ingest/pipelines/collier_parcels (FDOR NAL
OUT_FIELDS). lee_parcels/constants.py currently hardcodes
QUALIFIED_SALE_CODE = "01" with a one-line comment ("code 01 carries realistic prices;
nominal $100 transfers carry disqualified codes 11/17/30/37") â€” this manual is the full
authority behind that filter (codes 01-06, 11-21, 30-43, 98-99), current per DOR training
as of Oct 2025. LeePA also publishes year-specific snapshots of the same code set
(2018-2025) â€” linked but not yet pulled, see README.md.

Raw text extraction below (pdftotext -layout, unedited except for the header above):

```
               Training Narrative
Department of Revenue's Real Property

  Transfer Qualification Code Training

        Florida Department of Revenue
              Property Tax Oversight
                    October 2025
                                 Table of Contents

1 Introduction.............................................................................................................1

    1.1 DOR Disclaimer ..................................................................................................1
    1.2 About This Training .............................................................................................1
    1.3 Objectives ...........................................................................................................1
2 Foundation of the Verification Process .................................................................2

    2.1 Foundation of the Verification Process ................................................................2
    2.2 Foundation of the Verification Process Summary ................................................3
    2.3 We Will Discuss ..................................................................................................3
3 Why We Have Transfer Codes ...............................................................................4

    3.1 Why We Have Transfer Codes............................................................................4
    3.2 The Real Property Transfer Code List .................................................................5
4 The Importance of Documentation ........................................................................7

5 Reference Library ...................................................................................................9

6 Correctly Using Codes ...........................................................................................10

7 The Transfer Codes ................................................................................................11

    Transfer Codes 01 and 02 ...........................................................................................11
    Transfer Code 01 ........................................................................................................12
    Transfer Code 02 ........................................................................................................13
    Transfer Codes 03 through 06 .....................................................................................15
    Transfer Code 03 ........................................................................................................16
    Transfer Code 04 ........................................................................................................18
    Transfer Code 05 ........................................................................................................19
    Transfer Code 06 ........................................................................................................21
    Transfer Codes 11 through 21 .....................................................................................22
    Transfer Code 11 ........................................................................................................23
    Transfer Code 12 ........................................................................................................25
    Transfer Code 13 ........................................................................................................27
    Transfer Code 14 ........................................................................................................28
    Transfer Code 15 ........................................................................................................29
    Transfer Code 16 ........................................................................................................30
    Transfer Code 17 ........................................................................................................31
    Transfer Code 18 ........................................................................................................33
    Transfer Code 19 ........................................................................................................35
    Transfer Code 20 ........................................................................................................37
    Transfer Code 21 ........................................................................................................38
    Transfer Codes 30 through 43 .....................................................................................39
    Transfer Code 30 ........................................................................................................40
    Transfer Code 31 ........................................................................................................42
    Transfer Code 32 ........................................................................................................43
    Transfer Code 33 ........................................................................................................45
    Transfer Code 34 ........................................................................................................46
    Transfer Code 35 ........................................................................................................48
    Transfer Code 36 ........................................................................................................51
    Transfer Code 37 ........................................................................................................55
    Transfer Code 38 ........................................................................................................59
    Transfer Code 39 ........................................................................................................61
    Transfer Code 40 ........................................................................................................64
    Transfer Code 41 ........................................................................................................67
    Transfer Code 42 ........................................................................................................69
    Transfer Code 43 ........................................................................................................70
    Transfer Codes 98 through 99 .....................................................................................72
    Transfer Code 98 ........................................................................................................73
    Transfer Code 99 ........................................................................................................74

8 Frequently Asked Questions..................................................................................75

9 Thank You ...............................................................................................................76

10 Appendix .................................................................................................................77

    Image2.1.1: SalesVerification Questionnaire................................................................77
    Image2.1.2: Questionsfor SpecificSituations................................................................78
    Image 2.1.3: Documentation Form................................................................................79
    Image 3.2.1: Real Property Transfer Qualification Code List ...........................................80
1 Introduction

Welcome to the Florida Department of Revenue's (Department) Real Property
Transfer Qualification Code Training course. This training is adapted from our online
course.
1.1 DOR Disclaimer
This material is for informational and educational purposes only and is not intended to be legal
advice or replace Florida Statutes, Rules, Attorney General Opinions, etc. This training
information is provided to assist property appraisers and their staff with understanding how to
correctly apply the Department of Revenue's Real Property Transfer Qualification Codes for
assessment purposes in Florida. No other use of this information is intended.
This material contains excerpts from the IAAO Standard on Verification and Adjustment of Sales
dated April 2020 (cited as IAAO SV&AS in this training module) as well as the IAAO logo.
Permission from the IAAO Director of Publications was obtained in advance. Please note that
when a portion of a section is excluded from the excerpt, an ellipsis (...) is provided in place of
the excluded text. This is done in an effort to provide clear and concise information that relates
directly to the topic being discussed and is not intended to alter the meaning of the IAAO
Standard. Please refer to the complete text of the Standard for context; a link is provided on the
Reference Library page.

1.2 About This Training
This PDF version of the training module is intended for reference purposes. If you need to
receive a certificate to document completion and two hours of continuing education (CE), you
must view the online module in its entirety, which is available here.

1.3 Objectives
The primary objectives of this training are:

    · Convey details of the foundation of the verification process.
    · Explain why we have transfer codes.
    · Discuss the importance of documentation.
    · Describe how to apply each transfer code.
    · Provide answers to frequently asked questions.

                                                               1
2 Foundation of the Verification Process

2.1 Foundation of the Verification Process

The International Association of Assessing Officers (IAAO) is a recognized leader in assessment
administration, property appraisal, and property tax policy. The Department's
Property Tax Oversight program uses the IAAO professional standards as a basis for many of
its functions. The following slides highlight IAAO's fundamental approach to sale verification.
This approach is the foundation of the Department's guidance to property appraisers on the sale
verification process and the Real Property Transfer Qualification Codes prescribed for use under
section 195.0995(1), Florida Statutes (F.S.).

"IAAO assessment standards represent a consensus in the assessing profession and have been
adopted by the Board of Directors of the International Association of Assessing Officers (IAAO).
The objective of the IAAO standards is to provide a systematic means for assessing officers to
improve and standardize the operation of their offices. IAAO standards are advisory in nature
and the use of, or compliance with, such standards is voluntary. If any portion of these
standards is found to be in conflict with national, state, or provincial laws, such laws shall
govern. Ethical and/or professional requirements within the jurisdiction[1] may also take
precedence over technical standards." IAAO Standard on Verification and Adjustment of
Sales (SV&AS), Title page.

"The primary responsibility of the assessor is estimating the market value of each property
within the jurisdiction. The integrity of the property tax is dependent on the accuracy of these
estimates of market value. This is accomplished by analyzing market data to determine the
price that the property being appraised would probably bring in the marketplace on the date of
appraisal. ... Accuracy is dependent upon proper verification and adjustment of sales data."
IAAO, SV&AS, Section 1, "Scope."

NOTE: Florida Department of Revenue does not accept adjusted sale prices in the assessment
rolls; however, it may be appropriate for a property appraiser to adjust sale prices for use in
valuation activities.

"Sales data should be collected, verified, and adjusted as necessary for model calibration and
ratio study purposes. In some cases, sales may be valid for model calibration but should not be
considered valid for ratio study purposes. A verified sale is more reliable than an unverified
sale." IAAO, SV&AS, Section 2, "Introduction."

Most property appraisers have developed their own forms and procedures for sale verification;
please check with your manager for more information. The IAAO provides the following
suggested tools for the verification process:

Appendix A: Sales Verification Questionnaire
Appendix C: Questions for Specific Situations
Appendix F: Documentation Form (Sales Verification Form)

See image 2.1.1 ­ 2.1.3 in the appendix to see the forms.

"It is important to remember that all sales should be considered candidates as valid sales unless
sufficient information can be documented to show otherwise. While it is imperative that sales be
verified uniformly and accurately, it is also important to process and verify sales in a timely

                                                               2
manner, so they are available for analysis. Sales should be trimmed for outliers during the
statistical phase, not during the verification phase of a mass appraisal or sales ratio study
program." IAAO, SV&AS, Section 2, "Introduction."
This position is restated later in the standard as well:
"The position should be taken that all sales are candidates as valid sales unless sufficient
information can be documented to show otherwise. If sales are excluded for ratio studies
without substantiation, the study may appear to be subjective. Reason codes may be
established for valid and invalid sales for both ratio studies and model calibration." IAAO,
SV&AS, Section 5, "Sales Verification."

2.2 Foundation of the Verification Process Summary
Here are some important points to remember from the introductory section:

         · The responsibility for valuing properties lies with the local property appraiser.
         · The verification process supports the valuation task.
         · The IAAO Standard on Verification and Adjustment of Sales (SV&AS) provides

              detailed guidance for the verification process.
         · All sales should be considered valid sales candidates unless sufficient information

              can be documented to show otherwise.
         · The Department does not accept adjusted sale prices in the assessment rolls.

2.3 We Will Discuss
Now that we understand the foundation of the verification process, let's move on to the topic at
hand: applying transfer codes. We will discuss:

         · Why We Have Transfer Codes
         · Importance of Documentation
         · One-by-one, Real Property Transfer Codes
         · Frequently Asked Questions and Answers

                                                               3
3 Why We Have Transfer Codes

3.1 Why We Have Transfer Codes

 Section 193.114, Florida Statutes, Preparation of assessment rolls.

         (2) The real property assessment roll shall include:

         (n) The recorded selling price, ownership transfer date, and official record book and
         page number or clerk instrument number for each deed or other instrument transferring
         ownership of real property and recorded or otherwise discovered during the period
         beginning 1 year before the assessment date and up to the date the assessment roll is
         submitted to the Department. The assessment roll shall also include the basis for
         qualification or disqualification of a transfer as an arms-length transaction. A decision
         qualifying or disqualifying a transfer of property as an arms-length transaction must be
         recorded on the assessment roll within 3 months after the date that the deed or other
         transfer instrument is recorded or otherwise discovered. If, subsequent to the initial
         decision qualifying or disqualifying a transfer of property, the property appraiser obtains
         information indicating that the initial decision should be changed, the property appraiser
         may change the qualification decision and, if so, must document the reason for the
         change in a manner acceptable to the executive director or the executive director's
         designee. Sale or transfer data must be current on all tax rolls submitted to the
         Department. As used in this paragraph, the term "ownership transfer date" means the
         date that the deed or other transfer instrument is signed and notarized or otherwise
         executed.

 All transfers must be evaluated for inclusion in the annual ratio study conducted by the
 Department. Only arm's length sales of parcels that have not changed since the transfer
 occurred can be designated as "Qualified" for the ratio study. The basis for "Disqualified"
 transfers must be documented by applying the relevant transfer code (at a minimum).

 Qualified sale: "A property transfer that satisfies the conditions of a valid sale and meets all
 other technical criteria for inclusion in a ratio study sample. If a property has undergone
 significant changes in physical characteristics, use, or condition in the period between the
 assessment date and sale date, it would not technically qualify for use in ratio study."

    From the IAAO Standard on Ratio Studies (November 2013) ­ Definitions

"An arm's length transaction is a sale or lease transaction for real property where the parties
involved are not affected by undue stimuli from family, business, financial, or personal factors."
Florida Department of Revenue, The Florida Real Property Appraisal Guidelines, 2002,
Section 6.12.1, "Arm's-Length Transactions."

    Section 195.0995, F.S., Use of sales transaction data; qualification, review.
(1) For each sales transaction disqualified by a property appraiser, the property appraiser shall
document the reason for disqualification of the sale in a manner prescribed by the Department.
(2) The Department shall randomly sample all sales in the county to determine whether those

                                                               4
sales were properly qualified or disqualified. If the Department finds that more than 10 percent
of sales qualification decisions do not fall within the applicable criteria, the Department shall
issue a postaudit notification of defects and shall follow the procedures set forth in s. 195.097.
(3) Chapter 120 shall not apply to this section.
3.2 The Real Property Transfer Code List
Under s. 195.0995(1), F.S., the Department publishes the Real Property Transfer Code list.
Each December, the new transfer code list is included in a memo from the Property Tax
Oversight Director to property appraisers providing a draft of the Tax Roll Production,
Submission, and Evaluation Standards for the coming year. The memo and attached standards
include the lists for the prior year and the new year.
The Real Property Transfer Code list for the current and prior year are also available on our
website.
Please print the Real Property Transfer Code list. It will be used as a reference later in this
training module.
See image 3.2.1 in the appendix to view the list. (Also image below)

                                                               5
6
4 The Importance of Documentation

"A documentation form, preferably in electronic format, should be completed in a timely
manner for all sales that have had a follow-up verification, and the form should become part of
the sales file. ... Documentation forms should be completed at the time each sale has been
verified to limit the loss of valuable information or the possibility of mixing information from
different transactions. It is far better to over-document than under-document to eliminate the
need for additional follow-up contacts." IAAO SV&AS, Section 7, "Documenting the Results
of the Verification Process."

"Verification results should be accurately documented. Too much information is better than
insufficient documentation. Professionalism in completing the form is important because of all
the possible uses of the form including helping to resolve possible differences of opinion
between local and oversight agencies regarding the validity of sales." IAAO SV&AS, Section
7.1, "Conclusions/Comments."

1. As indicated on the Real Property Transfer Code list, documentation is required for certain
    codes.

         · The Department requires documentation that explains the basis for
              disqualification of a sale under codes 30 through 43.

         · Documentation that explains the basis for qualifying a transfer after initial
              disqualification (code 02) is also required.

         · The Department will require copies of documentation during the annual sale
              qualification study and SDF comparison.

         · Typical documentation may include other recorded deeds/instruments, sale
              verification forms, staff notes, staff attestations, real estate listing details, public
              records, corporate records, news articles, sale data, etc.

         · You may retain documentation in physical files, electronic form, or both.

2. Disqualification based on examination of the deed or transfer instrument (codes 11-21) may
    not require documentation.

3. You should reconsider the qualification decision for a transfer when/if you receive any new
    documentation (regardless of how much time has passed since the transfer).

All documentation should contain the following:

    · Parcel number and book and page/clerk instrument number
    · Sale price and sale date
    · Name and correct contact information of the person attesting to transaction details
    · The date your office obtained the information
    · Explanation of why the sale is qualified or disqualified contrary to the deed exam

You can use interview questionnaires or internal memos to document conversations about sale
transactions. In addition to the requirements listed previously, interview questionnaires or

                                                               7
internal memos should also contain the name of the person in the office who conducted the
interview.

The IAAO provides a suggested documentation form for internal use.
Appendix F: Documentation Form (Sales Verification Form)

See image 2.1.3 in the appendix to see the form.

Please be aware:

"Local knowledge" is not a valid reason to disqualify a sale unless you have direct transactional
involvement or have a direct conversation with a person who has first-hand knowledge about
the sale.

A decision to disqualify based on verbal information or direct knowledge must be documented.
Remember to place a written memo in the file to document a verbal verification of the sale with
an active participant. At a minimum, record the parcel identification number, date of transaction,
instrument number, the date of verification, the respondent's name, your name and the
transaction details.

A sale ratio or a comparison of a sale price to other sale prices IS NOT AN ACCEPTABLE FORM OF
DOCUMENTATION.

Use the following points in screening sales only, not as a reason to disqualify a sale:

         · Outliers (sale ratio or sale price)*
         · Change in market conditions between contract date and closing date of sale

Sales that appear to be questionable should be verified to determine if the transaction is arm's
length. Sales should not be disqualified based on assumptions or historical information.

* "It is a best practice to further verify sales with an atypical ratio. Such atypical ratios may be
the result of problems that warrant further investigation. One simple method of identifying such
sales is to use a ratio threshold (e.g., less than 50 percent or greater than 150 percent). A more
sophisticated strategy, however, is to identify atypical sales with a ratio markedly different from
sales of other surrounding or similar properties using graphical or statistical techniques. For
surrounding sales, this could be done through a visual examination of the sales ratios on a GIS
map, through the sorting of ratios by neighborhood or other location identifiers, or through a
geostatistical method that detects spatial outlier ratios. For similar sale properties, this could be
done graphically (e.g., scatter or box plots in which ratios are plotted against property
characteristics), through the sorting of ratios within prominent property characteristic strata, or
through statistical tests that identify outlier ratios. However, during sales verification sales should
never be excluded from a ratio study solely on the basis of the computed ratio. If no problems
are discovered with an atypical sale, it will likely emerge as an outlier and be subject to removal
during the statistical trimming process. " IAAO SV&AS 5.3.3 "Analytical Methods."

                                                               8
5 Reference Library

    · IAAO Standard on Verification and Adjustment of Sales
    · DOR Tax Roll Production, Submission, and Evaluation Standards
    · Chapter 12D-8, F.A.C.
    · Chapter 193, F.S.
    · Chapter 195, F.S.

                                                               9
6 Correctly Using Codes

To identify sales that are suitable for the Department's annual ratio studies, code all transfers
using the current Real Property Transfer Code list the Department provides.
The list provides for four groups of transfer codes:
Codes 01 and 02 are for qualified arm's-length sales that are suitable for use in the
Department's annual ratio studies.
Codes 03 through 06 are for arm's-length sales that are not suitable and are excluded from the
Department's annual ratio studies.
Codes 11 through 21 and 30 through 43 are for non-arm's length sales that are disqualified and
excluded from the Department's annual ratio studies.
Codes 98-99 are for transfers that are pending decision (not yet qualified or disqualified) and
are excluded from the Department's annual ratio studies.
DISCLAIMER: The following information contains examples of how the transfer qualification
codes should be applied in particular cases. Seemingly similar situations can still involve
important factual differences. The facts involved in seemingly similar actual situations may be
different from the facts presumed in the examples in this training information. The examples do
not constitute justification for qualifying or disqualifying any transfer of real property. Only
specific and relevant documented evidence provides this justification. The examples in this
training information are for educational purposes only and are not legal advice or a substitute for
the requirements of law.

                                                               10
7 The Transfer Codes

                                              Transfer Codes 01 and 02
Codes 01 and 02 are for qualified arm's length sales that are suitable for use in the
Department's annual ratio studies.
These appear in the first section of the Transfer Code List under the heading "QUALIFIED
Arm's Length Real Property Transfers (included in sales ratio analysis)"
Code 01 does not require additional documentation.
Code 02 requires documentation

                                                               11
                                                    Transfer Code 01
Description:
Transfers qualified as arm's length because of examination of the deed or other instrument
transferring ownership of real property
Description Details/Examples/Notes:
Use code 01 when the transfer instrument does not contain any information that would meet the
criteria for initial disqualification (see codes 11-21).

Reference:
IAAO SV&AS, Section 2, "Introduction."
"It is important to remember that all sales should be considered candidates for valid sales unless
sufficient information can be documented to show otherwise. While it is imperative that sales be
verified uniformly and accurately, it is also important to process and verify sales in a timely
manner so they are available for analysis. Sales should be trimmed for outliers during the
statistical phase, not during the verification phase of a mass appraisal or sales ratio study
program."

IAAO SV&AS, Section 5, "Sales Verification."
"The position should be taken that all sales are candidates as valid sales unless sufficient
information can be documented to show otherwise. If sales are excluded for ratio studies
without substantiation, the study may appear to be subjective."
Documentation:
Deed itself; no additional documentation required

    · Retain any additional documentation you receive or discover (for example: sale
         verification questionnaires, staff interview notes, MLS details, etc.).

    · If any documentation indicates the transfer was not arm's length, recode the transfer.
    · It is not necessary to recode arm's length transfers initially coded 01 to transfer code 02

         if you receive documentation; however, it is not inappropriate to recode to 02 if that is an
         established procedure in your office.

                                                               12
                                                    Transfer Code 02

Description:
Transfers qualified as arm's length because of documented evidence

Description Details/Examples/Notes:
Use code 02 when the transfer instrument contains information meeting the criteria for
disqualification (see codes 11-21), but documented evidence shows the transfer was in fact
arm's length.

Example: A bank sells a single-family residence to an individual. Initial review of the deed
indicates the transfer should be coded 12 (transfer to or from financial institutions). However,
the property appraiser's office receives verification from the seller that the sale had reasonable
exposure in a competitive, open market, and neither party was affected by undue stimuli from
family, business, financial, or personal factors. The transfer code could then change from code
12 to code 02.

Reference:
IAAO SV&AS, Section 2, "Introduction."
"A verified sale is more reliable than an unverified sale."

IAAO SV&AS, Section 5, "Sales Verification."
"Sales should be verified to determine whether they reflect the market value of the real property
transferred. The verification process should be conducted in a manner that is timely, uniform,
and transparent.
Specific objectives for sales verification should be documented, and they should include but not
be limited to the following:

    · Sale prices should be adjusted to reflect only the market value of the real property
         transferred net of personal property, financing, or leases.

    · Sales verification should include all sales that occurred during the time frame being
         tested or modeled.

    · Sales should be invalidated only when they fail to meet the requirements of an open-market, arm's-
         length transaction.

Jurisdictions should ensure verification is administered in a timely manner as close to the sale date as possible
to minimize loss of information.

The methods of sales verification--whether by questionnaires, follow-up interviews, or analytical methods--
should be performed in a uniform and transparent manner with guidance and documentation.

Sales that are considered invalid due to generally accepted non-arm's-length conditions need not be adjusted
for nonrealty components and should be excluded for use in ratio studies or modeling.
Sales that have special conditions, settlements, or arrangements that are otherwise an arm's-length transaction

                                                               13
may be adjusted to reflect market value, and jurisdictions should be clear on which conditions would warrant
such adjustments.
In verifying the property use and characteristics at the time of sale, jurisdictions should provide guidance on
which conditions they would deem adjustable and whether lease questionnaires should accompany sales
questionnaires for commercial properties.
"All sales meeting the definition of market value should be included as valid transactions unless
one of the following two conditions exists:

    · Data for the sale are incomplete, unverifiable, or suspect.
    · The sale fails to pass one or more specific tests of acceptability."
Documentation:
In general, typical documentation would include one or more of the following:
    · Verification from buyer, seller, or knowledgeable third party that transfer was arm's

         length
    · Attestation from PA or PA staff that transfer was arm's length
    · MLS/Co-Star/LoopNet/etc. details
    · Public records
Please see documentation details for transfer codes 11-21 for more detailed information.
NOTE: It is not necessary to recode arm's length transfers initially coded 01 to transfer code 02
if you receive documentation; however, it is not inappropriate to recode to 02 if that is an
established procedure in your office.

                                                               14
                                           Transfer Codes 03 through 06
Codes 03 through 06 are for arm's length sales that are not suitable and are excluded from the
Department's annual ratio studies.
These appear in the second section of the Transfer Code List under the heading "Arm's Length
Real Property Transfers (excluded from sales ratio analysis)"
Codes 03 through 06 all require documentation.

                                                               15
                                                    Transfer Code 03

Description:
Arm's length transaction at time of transfer, but the physical property characteristics changed
significantly after the transfer AND prior to the date of valuation, or transfer included property
characteristics not present at time of transfer

Description Details/Examples/Notes:
A transfer should be coded 03 when:

         · The transfer was arm's length and the physical characteristics of the property
              significantly changed after the transfer but prior to the date of appraisal OR

         · The transfer was arm's length and the transfer included improvements that were not
              substantially complete or were not yet built by the date of appraisal.

Remember, this transfer code is for arm's length transactions that fit the code description above.

Significant physical changes would include splitting the parcel, combining with one or more
parcels, new construction, removal/deletion of improvements, disaster damage,
remodel/renovation of improvements or incomplete new construction. The Department has
established the following sale property change codes to document the type of change:

1-parcel split
2-parcel combination
3-new construction
4-deletion (demolition, removal non-disaster)
5-disaster
6-other (multiple changes/incomplete construction, etc.)
7-remodel/renovation
8-incomplete new construction

NOTE: Sale property change codes 3 and 4 may be used with transfer codes 01 and 02 if the
value of the new construction or deletion is equal to or less than 10 percent (%) of the sale
price. This maximizes the number of sales used in the ratio study.

Complete details and instructions for sale property change codes are in the PTO's annual Tax
Roll Production, Submission, and Evaluation Standards.

Example (significant characteristic change): In March 2015, a 10-acre parcel sold for $100,000.
After the sale but before January 1, 2016, the buyer split the 10-acre parcel into two 5-acre
parcels and sold one of the 5-acre parcels. The parent parcel is now 5 acres, and that is what
the just value reflects on January 1, 2016. Calculating a ratio based on a sale price that reflects
10 acres and a just value that reflects 5 acres would be a mismatch. The transfer code would
initially be code 01 but would change to code 03 with a sale property change code 1-split.

Example (includes characteristics not present): In September 2015, a builder sold a parcel to an
individual for $200,000. At the time of sale, the parcel was vacant. However, the $200,000 sale

                                                               16
price was for the lot and a new single-family residence that would be built within the next several
months. On January 1, 2016, the home was not complete and calculating a ratio based on a sale
price that reflects a completed home and a just value that reflects a vacant lot would be a
mismatch. The transfer code would be 03 with a sale property change code 8- incomplete new
construction. If, on January 1, 2016, the home was complete, then the transfer code would have
changed to code 01 (as the property characteristics that were sold were the same as the
property characteristics being assessed).

Reference:
IAAO SV&AS, Section 4, "Useful Sales Information."
"Sales data files should reflect the physical characteristics of the property at the time of sale. If
significant legal, physical, or economic changes have occurred between the sale date and the
assessment date, the sale should not be used for ratio studies. The sale may still be valid for
mass appraisal modeling by matching the sale price against the characteristics that existed on
the date of sale."

IAAO SV&AS, Section 4.1.3, "Legal Description, Address, and Parcel Identifier."
"The legal description also helps identify parcel splits, which are not usable in ratio studies."

IAAO SV&AS, Section 5.6.3, "Property Characteristic Changes,"
"Sales data files should reflect the physical characteristics of the property when sold. For ratio
studies, if significant physical changes have occurred to the property between the date of sale
and the appraisal date, the sale should not be included. The sale may still be valid for mass
appraisal modeling by matching the sale price to the characteristics that existed on the date of
sale. For consistency in application, written guidelines should be provided as to what constitutes
significant change. For example, an improvement of $3,500 may not be significant for a property
with a selling price of $255,000 (1.4 percent) but is significant for a property selling for $21,000
(16.7 percent)."

Documentation:
In general, typical documentation would include one of more of the following:

    · Owner requests/recordings for parcel splits or combinations, permitting records for new
         construction, deletions or significant renovations, field appraiser records (especially for
         improvements not substantially complete/not yet built and will not be assessed as of Jan.
         1)

    · Verification from buyer, seller, or knowledgeable third party regarding a change to the
         property characteristics after the transfer

                                                               17
                                                    Transfer Code 04

Description:
Arm's length transaction at time of transfer, but the legal characteristics changed significantly
after the transfer AND prior to the date of valuation

Description Details/Examples/Notes:
Use transfer code 04 when the legal characteristics of the property significantly change after the
transfer but before the date of appraisal. This includes changes to zoning, future land use,
building moratoriums, subdivision covenants or restrictions, flood zone changes, and the
imposition or change to environmental regulations, which preclude or change building plans and
value or significantly impact the use or fair market value of the property.

Remember, this transfer code is for arm's length transactions that fit the code description above.

Example: In June 2015, a business owner purchased a vacant lot that was zoned commercial
with the intention of building a new office. In November 2015, the county updated the list of
parcels that fall within the Any-Animal Protection zone. The recently purchased vacant lot now
falls within this protection zone, which prohibits new construction on protected parcels.

Example: In June 2009, a person purchased a vacant residential lot with the intention of building
a new single-family home. In August 2009, the FEMA flood maps were updated and, as a result,
the recently purchased vacant lot has been mapped into a high-risk flood area, which
significantly affects the fair market value of the property. Calculating a ratio based on a sale
price for the property before the flood zone change and a just value for the property after the
flood zone change would be a mismatch.

Reference:
IAAO SV&AS, Section 4, "Useful Sales Information."
"Sales data files should reflect the physical characteristics of the property at the time of sale. If
significant legal, physical, or economic changes have occurred between the sale date and the
assessment date, the sale should not be used for ratio studies. The sale may still be valid for
mass appraisal modeling by matching the sale price against the characteristics that existed on
the date of sale."

IAAO SV&AS, Section 5.6.4, "Property Change in Use."
"In ratio studies, property in which the use has changed between the date of appraisal and the
date of sale should be excluded from further analysis. However, the sale may be used for
analytical purposes if it can be matched with its use and physical characteristics at the time of
sale."

Documentation:
In general, typical documentation would include one or more of the following. Zoning or future
land use changes, building moratoriums, revised subdivision covenants or restrictions,
revised environmental regulations, other relevant information or documentation provided or
discovered

                                                               18
                                                    Transfer Code 05

Description:
Arm's length transaction transferring multiple parcels with multiple parcel identification numbers
(deed must be recorded on all parcels included in the transaction, and the full sale price, as
calculated from the documentary stamp amount, must be reflected on all parcels)

Description Details/Examples/Notes:
Use code 05 when a transfer is qualified as arm's length and involves multiple parcels, each
having separate parcel identification numbers that are transferred on one instrument. The full
sale price, as calculated from the documentary stamp amount, must be reflected on all
parcels. IMPORTANT: If the transfer involves multiple parcels but the transfer instrument meets
the criteria for initial disqualification, use the appropriate disqualification code (11-21).

Additionally, if the transfer involved multiple parcels and documentation indicates the sale was
not arm's length, use the appropriate disqualification code (30-42).

Remember, this transfer code is for arm's length transactions that fit the code description above.

Example (Correct Use): In September 2014, three parcels (12-34-56789-A, 12-34-56789-B, and
12-34-56789D) sold for $60,000 on one deed. Each parcel comprised a single economic unit.
The parcel numbers are listed separately on the deed, and the deed does not contain any
information that meets the criteria for initial disqualification (codes 11-21). Calculating a ratio
based on a sale price for three parcels and a just value for one parcel would be a mismatch.
However, the transfer may be useful in other types of sales analysis.

Example (Incorrect Use A): In September 2014, four vacant, contiguous lots sold for $100,000
on one deed. Together, these four lots comprised a single economic unit (single home site) and
were all listed on one parcel identification number. The subdivision lot numbers are listed
separately on the deed, and the deed does not contain any information that meets the criteria
for initial disqualification (codes 11-21). In this example, using code 05 would be incorrect, since
only one economic unit (listed on a single parcel number) was transferred. The correct transfer
code would be 01 (as would calculation of a ratio based on a sale price for one parcel with four
lots comprising a single economic unit and a just value for one parcel with four lots comprising a
single economic unit).

Example (Incorrect Use B): In April 2015, a bank sold three parcels (89-76-1234-D, 89-76-1234-
G, and 89-76-1234-H) for $90,000 to an individual on one deed. Each parcel comprised a single
economic unit. The parcel numbers are listed separately on the deed. While this transfer meets
the criteria of a multiple-parcel transaction, it should initially be coded 12 because one of the
parties involved was a financial institution. Note: Further investigation may reveal that this was
an arm's length transaction and a transfer code of 05 may be appropriate.

                                                               19
Reference:
IAAO SV&AS, Section 5.6.2, "Multiple-Parcel Sales."
"A multiple-parcel sale is a transaction involving more than one parcel of real property. These
transactions present special considerations and should be researched and analyzed prior to
being used for valuation or ratio studies.
"If the appraiser needs to include multiple-parcel sales, it should be determined whether the
parcels are contiguous and whether the sale is a single economic unit or multiple economic
units. Regardless of whether the parcels are contiguous, any multiple-parcel sale that involves
multiple economic units generally should not be used in valuation or ratio studies."
Documentation:
Deed itself; a single deed or transfer instrument which transfers multiple parcels with multiple
parcel identification numbers and appears to be arm's length.

                                                               20
                                                    Transfer Code 06
Description:
Arm's length transaction transferring a single parcel that crosses one or more county lines
Description Details/Examples/Notes:
Use code 06 when a transfer is qualified arm's length and the parcel's boundaries cross one or
more county lines. IMPORTANT: If the transfer instrument meets the criteria for disqualification
based on examination of the deed or instrument (codes 11-21) or based on documented
evidence (codes 30-43), use the appropriate disqualification code.
Remember, this transfer code is for arm's length transactions that fit the code description above.
Example: A 1-acre parcel sold in March 2015 for $50,000. The legal description of the parcel
indicates approximately .25 acre of the parcel lies in Sumter County, approximately .25 acre of
the parcel lies within Marion County, and the remaining .50 acre of the parcel lies within Lake
County. Calculating a ratio based on a sale price for one acre and a just value for .25 acre or for
.50 acre would be inaccurate. It would also be inaccurate to use code 16 (transfer of ownership
less than 100 percent undivided interest) because 100 percent of the parcel being assessed in
each county was transferred.

Reference:
While this topic is not specifically addressed in the IAAO standard, each county property
appraiser is responsible for recording and qualifying transfers of properties in only that county. If
a transfer included a parcel from more than one county, the recorded sale price as indicated by
the documentary stamps may not reflect the value for separate portions of the parcel in each
respective county.

IAAO SV&AS, Section 1, "Scope."
"The primary responsibility of the assessor is to estimate the market value of each property
within the jurisdiction."

Documentation:
Legal description in the deed or instrument itself along with GIS mapping details showing the
subject of the deed lies in more than one county.

                                                               21
                                           Transfer Codes 11 through 21
Codes 11 through 21 are for non-arm's length sales that are disqualified and excluded from the
Department's annual ratio studies based on the deed (or instrument) itself.
These appear in the third section of the Transfer Code List under the heading "DISQUALIFIED
Real Property Transfers Based on Deed Type or Examination of the Deed/Real Property
Transfer Instrument."
Codes 11 through 21 do not require documentation.

                                                               22
                                                    Transfer Code 11

Description:
Corrective deed, quit claim deed, or tax deed; deed bearing Florida documentary stamp at the
minimum rate prescribed under Chapter 201, F.S.; transfer of ownership in which no
documentary stamps were paid.

Description Details/Examples/Notes:
Use code 11 when the instrument type is a corrective deed, a quit claim deed, or a tax deed.
Also use code 11 for transfers when the paid documentary stamp tax is either $0.70 (minimum
prescribed by law) or $0.00 (none paid).

NOTE: The Department does not require counties to report chain of title instruments such as
name changes, marriage certificates, death certificates, court orders, etc., that do not actually
transfer ownership. However, if a property appraiser maintains records on these types of non-
ownership transfer chain of title documents, these should also be coded 11.

Reference:
IAAO SV&AS, Section 3.1 "Real Estate Transfer Documents."
"A deed in which the grantor conveys or relinquishes all interests in a property without warrant
as to the extent or validity of such interests is known as a quitclaim deed. The quitclaim deed is
the least protective deed for the buyer and conveys only whatever rights or interests the grantor
has in the property. There are no warranties or covenants to the buyer. If the grantor has a good
title, it is as good as the warranty deed; however, there are no warranties or guarantees.
Tax deeds (Sheriff, Marshalls) are deeds by which title to real property, sold to discharge
delinquent taxes, is transferred by a tax collector or other authorized officer of the law to the
purchaser at a tax sale."

IAAO SV&AS, Section 5.4.8, "Sales of Doubtful Title."
"Sales in which title is in doubt tend to be below market value. When a sale is made on other
than a warranty deed, there is a question of whether the title is merchantable. A quitclaim deed
is an example."

IAAO SV&AS, Definitions.
"Sale of Convenience: A sale designed to correct defects in the title, create a joint or
common tenancy, or serve some similar purpose (not an actual sale). Such sales generally
retransacted at only a nominal price."

Documentation:
Deed itself; no additional documentation required.

If any documentation is received that indicates the transfer was arm's length, the transfer
would need to be recoded. Examples of documentation for recoding as qualified arm's length
(transfer code 02):

                                                               23
· Verification (written, verbal) from buyer, seller, or knowledgeable third party that quit
    claim deed was used for a unique reason and that the sale is arm's length

· Attestation from PA or PA staff that quit claim deed was used for a unique reason and
    that the sale is arm's length

· Corrective Deed is recorded to show correct doc stamps

                                                          24
                                                    Transfer Code 12

Description:
Transfer to or from financial institutions (use transfer code 18 for government entities); deed
stating, "In Lieu of Foreclosure" (including private lenders)

Description Details/Examples/Notes:
A transfer should be coded 12 when either the grantor or grantee is a financial institution or the
transfer instrument states that the instrument is being given "in lieu of foreclosure." If a private
lender (non-financial institution) provided the mortgage and the private lender is receiving the
property back in lieu of foreclosure, the transfer would be coded 12. Financial institutions
include banks, credit unions, loan companies, and mortgage companies. Please note that
foreclosure transactions involving government entities should be coded 18.

Several types of foreclosure-related transfers may occur, including forced or duress sales,
deeds in lieu of foreclosure, transfers resulting from foreclosure, and real estate owned (REO)
transfers. Scroll down for additional information on the qualification and disqualification of
foreclosure-related transfers.

Transfers to prevent foreclosure; Transfers which were forced or under duress: The
circumstances of these types of transfers are not typically evident on the transfer instrument, but
rather are learned through research of the transaction. If a Property Appraiser has researched
and obtained documented evidence proving a transfer was to prevent foreclosure, was forced,
and/or was under duress and did not meet the criteria of an arm's length transaction, the transfer
should be disqualified with code 38. It is not appropriate to use transfer code 12 because it did
not directly involve a financial institution as grantor or grantee and was not specifically "In Lieu of
Foreclosure." Please see details for transfer code 38 for specific guidance.

Deeds in Lieu of Foreclosure: This type of transfer occurs when the borrower voluntarily
transfers title to the lender to avoid potential foreclosure action by the lender. The lender will
typically be listed as the grantee and the transfer instrument will typically state "In lieu of
foreclosure" or state something similar to "deed being given in absolute conveyance in
consideration of the cancelation of the mortgage." This type of transfer is not arm's length and
should be disqualified with code 12.

Transfers resulting from foreclosure: This type of transfer occurs when title to the property is
taken from a borrower in default on their mortgage. The property is then auctioned and title
g i v e n to the successful bidder. Ownership transfer is typically issued on a Certificate of Title,
issued by the Clerk of Courts. This type of transfer is not arm's length and should be disqualified
with code 18 (transfer to or from a governmental agency).

Real Estate Owned (REO): This type of transfer occurs after a lender takes title to property
either through foreclosure or through "in lieu of foreclosure" transfers. The lender will typically
be listed as the grantor. This type of transfer should initially be disqualified with code 12.
However, an REO transfer may be qualified (using code 02) if the Property Appraiser obtains

                                                               25
documented evidence proving the transfer is an arm's-length transaction.

It is also important to note that not all transfers involving financial institutions as either the
grantor or the grantee are foreclosure-related (for example, a bank may purchase property
for a new branch location). Transfers to or from a financial institution should be initially
disqualified with code 12. However, these transfers may be qualified (using code 02) if the
Property Appraiser obtains documented evidence proving the transfer is an arm's length
transaction.

Reference:
IAAO SV&AS, Section 5.4.3 Sales Involving Financial Institutions as Buyer.

 "These sales are often made in lieu of foreclosure and are not exposed to the open market.
However, open-market sales in which a financial institution is a willing buyer, such as the
purchase of vacant land for a branch bank, may be considered potentially valid transactions."

IAAO SV&AS, Section 5.4.4 Sales Involving Financial Institution as Seller.
"A foreclosure is not a sale but the legal process by which a lien on a property is enforced. The
majority of the sales in which the financial institution is the seller are properties that were
formerly foreclosed on by the financial institution. Also, they are easily identified because the
seller is the financial institution. These sales typically are on the low side of the value range
because the financial institution is highly motivated to sell and may be required by banking
regulations to remove the property from its books. The longer the property is carried on the
books by the financial institution, the lower the asking price is likely to be. If the financial
institution was ordered by banking regulators to dispose of the property regardless of the sale
price, the sale should not be included as a valid transaction. ..."

Documentation:
Deed itself; no additional documentation required.
If any documentation that indicates the transfer was arm's length, recode the transfer.
Examples of documentation for recoding as qualified arm's length (transfer code 02):

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that financial
         institution transfer was arm's length

    · Attestation from PA or PA staff that financial institution transfer was arm's length
    · Documentation showing property was listed (MLS, Co-Star, LoopNet, etc.) and was

         arm's length

                                                               26
                                                    Transfer Code 13
Description:
Transfer conveying cemetery lots or parcels
Description Details/Examples/Notes:
Use code 13 when the real property being transferred is an individual cemetery/burial plot.
Reference:
While this topic is not specifically addressed in the IAAO standard, because of limited rights of
ownership of cemetery/burial plots, the following IAAO reference is relevant:
IAAO SV&AS, Section 4.2.1, "Interest Transferred."
"A transaction that conveys the full rights of ownership to a property is known as a fee simple
transfer. Fee simple is defined in land ownership as the complete interest in a property, subject
only to governmental powers such as eminent domain. (for further clarification on fee simple
definition see IAAO position paper - Setting the Record Straight on Fee Simple [IAAO 2015])
Transfers that convey less than full interest are rarely usable in mass appraisal or in ratio
studies without adjustments, unless the appraised value and sale price reflect the same
ownership rights. Examples of partial interest transfers include sales involving life estates,
fractional interest, air rights, and mineral rights."
Documentation:
Deed itself; no additional documentation required.

                                                               27
                                                    Transfer Code 14
Description:
Transfer containing a reservation of occupancy for more than 90 days (life estate interest)

Description Details/Examples/Notes:
Use code 14 when the transfer instrument indicates a reservation of occupancy of the real
property for more than 90 days. Typically, either the grantor or grantee will make the reservation
for a life estate interest. A life estate interest allows the life tenant to remain in the property until
his or her death. After the life tenant's death or the occupancy reservation has expired, the
remainderman will take possession of the property.

Example A: A widow sells her single-family residence to two individuals with joint rights of
survivorship. The transfer instrument states the grantor reserves a life estate interest in the
described property for and during her natural lifetime and the grantees will take possession 60
days after the grantor's death. In this example, the grantor will remain in the home until her
death, even though she has sold the home to the grantees. Code 14 is appropriate for this
transfer.

Example B: A condo developer sells a condo to a single individual. The transfer instrument
states the grantor has sold a life estate in the described real property to the grantee, subject to a
reversionary interest in favor of the grantor. In this example, the grantor has sold the condo to
the grantee with the agreement that when the grantee dies, the grantor will receive the property
back. Code 14 is appropriate for this transfer.

Reference:
IAAO SV&AS, Section 4.2.1, "Interest Transferred."
A transaction that conveys the full rights of ownership to a property is known as a fee simple
transfer. Fee simple is defined in land ownership as the complete interest in a property, subject
only to governmental powers such as eminent domain. (for further clarification on fee simple
definition see IAAO position paper - Setting the Record Straight on Fee Simple [IAAO 2015])
Transfers that convey less than full interest are rarely usable in mass appraisal or in ratio
studies without adjustments, unless the appraised value and sale price reflect the same
ownership rights. Examples of partial interest transfers include sales involving life estates,
fractional interest, air rights, and mineral rights.

Documentation:
Deed itself; no additional documentation required.

                                                               28
                                                    Transfer Code 15
Description:
Removed - not currently accepted; reserved for future use
Description Details/Examples/Notes:
DO NOT USE. The Department has removed this code and will not accept it. The Department
will require any transfers mistakenly coded 15 on an SDF to be recoded.

                                                               29
                                                    Transfer Code 16

Description:
Transfer conveying ownership of less than 100% undivided interest

Description Details/Examples/Notes:
Use code 16 when the transfer instrument indicates less than 100 percent undivided ownership
interest is being transferred.

Example (Correct Use): John Smith, Joe Smith, and James Smith own a parcel. Joe Smith
decided to sell his interest in the parcel to Jane Doe. The transfer instrument indicates Joe is
transferring his one-third interest in the real property described to Jane. Calculating a ratio
based on a sale price for a one-third interest in a parcel and a just value for the entire parcel
would be a mismatch.

Example (Incorrect Use): John Smith, Joe Smith, and James Smith own a parcel. All three
decided to sell their interest in the parcel to Jane Doe. The transfer instrument indicates John,
as to his one-third interest, Joe, as to his one-third interest, and James, as to his one-third
interest, are transferring the real property described to Jane. In this example, 100 percent of the
ownership is transferring. Calculating a ratio based on a sale price for 100 percent of a parcel
and a just value for 100 percent of the parcel would be accurate and the transfer should be
coded 01.

Related information: It is not unusual to use multiple deeds or instruments to record a transfer
involving multiple grantors transferring 100 percent of the ownership. Typically, one instrument
will have documentary stamps reflecting the entire sale price, while the other instruments show
minimal documentary stamps. Best practices dictate that verification of the sale price and
purpose for using multiple instruments is appropriate. If the sale price on one instrument is
arm's length, then that transfer should be coded 02, while the others should be coded 11 (for
minimal documentary stamps). Transfer code 16 is not appropriate when 100 percent interest is
transferring.

Reference:
IAAO SV&AS, Section 4.2.1, "Interest Transferred."
A transaction that conveys the full rights of ownership to a property is known as a fee simple
transfer. Fee simple is defined in land ownership as the complete interest in a property, subject
only to governmental powers such as eminent domain. (for further clarification on fee simple
definition see IAAO position paper - Setting the Record Straight on Fee Simple [IAAO 2015])
Transfers that convey less than full interest are rarely usable in mass appraisal or in ratio
studies without adjustments, unless the appraised value and sale price reflect the same
ownership rights. Examples of partial interest transfers include sales involving life estates,
fractional interest, air rights, and mineral rights.

Documentation:
Deed itself; no additional documentation required.

                                                               30
                                                    Transfer Code 17
Description:
Transfer to or from a religious, charitable, or benevolent organization or entity

Description Details/Examples/Notes:
Use code 17 for a transfer when either the grantor or grantee is a religious, charitable, or
benevolent organization or entity.

Please note that not every non-profit is a religious, charitable, or benevolent organization and
that not every religious organization is non-profit.

An example would be a non-profit neighborhood association or cooperative. It is not unusual for
these types of non-profit organizations to be named on deeds because that is the typical form of
property transfer for that neighborhood. When this is the typical form of property transfer for a
neighborhood, arm's length transfers should be coded 01 regardless of the non-profit status of
the party. Again, code 17 is not appropriate if the non-profit is not a "religious, charitable, or
benevolent organization or entity."

It is also important to note that a property with appropriate market exposure and no restrictive
covenants may transfer to or from a religious, charitable, or benevolent organization and be
arm's length. Transfers to or from a religious, charitable, or benevolent organization or entity
should be initially disqualified with code 17. However, these transfers may be qualified (using
code 02) if the property appraiser obtains documented evidence proving the transfer is an arm's
length transaction (see below).

The IRS provides a search tool for checking the status of an organization. At the time of
publication, the search tool was available at https://apps.irs.gov/app/eos/.

Reference:
IAAO SV&AS, Section 5.4, "Sales Generally Considered Invalid."
"The following types of sales are often found to be invalid and can be excluded unless a larger
sample size is needed. If a larger sample size is needed, these sales require verification.

    · Sales involving government agencies
    · Sales involving charitable, religious, or educational institutions..."

IAAO SV&AS, Section 5.4.2, "Sales Involving Charitable, Religious or Educational Institutions."
"A sale to such an organization can involve an element of philanthropy, and a sale by such an
organization can involve a nominal consideration or restrictive covenants. These sales often
involve partial gifts and therefore are generally not representative of market value."

Documentation:
Deed itself; no additional documentation required

                                                               31
If you receive any documentation that indicates the transfer was arm's length, recode the
transfer. Examples of documentation for recoding as qualified arm's length (transfer code 02):

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that transfer
         was arm's length

    · Attestation from PA or PA staff that transfer was arm's length
    · Documentation showing property was listed (MLS, Co-Star,

         LoopNet, etc.) and was arm's length

                                                               32
                                                    Transfer Code 18

Description:
Transfer to or from a federal, state, or local government agency (including trustees (or board) of
the Internal Improvement Trust Fund, courts, counties, municipalities, sheriffs, or educational
organizations as well as FDIC, HUD, Fannie Mae, and Freddie Mac)

Description Details/Examples/Notes:
Use code 18 when either the grantor or grantee is a federal, state, or local government agency,
the Board or Trustees of the Internal Improvement Trust Fund, or an educational organization. A
partial list of federal agencies includes FDIC, HUD, Fannie Mae, and Freddie Mac.
Code 18 is appropriate for transfers involving government agencies, including those resulting
from court-ordered foreclosure. This type of transfer occurs when title to the property is taken
from a borrower in default on his or her mortgage. The property is then auctioned and the
successful bidder obtains title. The clerk of courts (a governmental agency) typically issues
ownership transfer on a certificate of title. This type of transfer is not arm's length and should be
disqualified with code 18. (See code 12 for non-governmental foreclosure transfers.)

Reference:
IAAO SV&AS, Section 5.4, "Sales Generally Considered Invalid."
"The following types of sales are often found to be invalid and can be excluded unless a larger
sample size is needed. If a larger sample size is needed, these sales require verification.

    · Sales involving government agencies
    · Sales involving charitable, religious, or educational institutions...
    · Forced sales resulting from a judicial order..."

IAAO SV&AS, Section 5.4.1, "Sales Involving Government Agencies."
"Sales to government agencies can involve an element of compulsion and often occur at prices
higher than would otherwise be expected. When the governmental agency is the seller, values
typically fall on the low end of the value range. The latter should not be considered in model
calibration or ratio studies unless an analysis indicates governmental sales have affected the
market in specific market areas or neighborhoods. Each sale in this category should be
thoroughly researched prior to use."

IAAO SV&AS, Section 5.4.2, "Sales Involving Charitable, Religious or Educational Institutions."
"A sale to such an organization can involve an element of philanthropy, and a sale by such an
organization can involve a nominal consideration or restrictive covenants. These sales often
involve partial gifts and therefore are generally not representative of market value."

IAAO SV&AS, Section 5.4.7, "Forced Sales Resulting from a Judicial Order."
"These sales should never be considered for model calibration or ratio studies. The seller in
these sales is usually a sheriff, receiver, or other court officer."

                                                               33
Documentation:
Deed itself; no additional documentation required
If you receive any documentation that indicates the transfer was arm's length, recode the
transfer. Examples of documentation for recoding as qualified arm's length (transfer code 02):

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that transfer
         was arm's length

    · Attestation from PA or PA staff that transfer was arm's length
    · Documentation showing property was listed (MLS, Co-Star,

         LoopNet, etc.) and was arm's length

                                                               34
                                                    Transfer Code 19

Description:
Transfer to or from bankruptcy trustees, administrators, executors, guardians, personal
representatives, or receivers

Description Details/Examples/Notes:
Use code 19 when either the grantor or grantee is specifically referenced as being a bankruptcy
trustee, an administrator, an executor, a guardian, a personal representative, or a receiver.

Example (correct use A): The transfer instrument states the grantor is John Doe, as duly
appointed Chapter 11 trustee in bankruptcy for the estate of ABC Corporation.

Example (correct use B): The transfer instrument states the grantor is Jane Doe, as personal
representative of the estate of John Smith, deceased.

Example (incorrect use A): The transfer instrument states the grantee is John Doe, as trustee
for the John and Jane Doe Revocable Trust. In this example, the trustee is not a trustee in
bankruptcy; therefore code 19 does not apply.

Example (incorrect use B): The transfer instrument shows the grantee is James Doe, a trustee
for a land trust. In this example, the trustee is not a trustee in bankruptcy; therefore code 19
does not apply.

Reference:
IAAO SV&AS, Section 5.4, "Sales Generally Considered Invalid."
"The following types of sales are often found to be invalid and can be excluded unless a larger
sample size is needed. If a larger sample size is needed, these sales require verification.

    · Sales involving government agencies
    · Sales involving charitable, religious, or educational institutions...
    · Forced sales resulting from a judicial order..."

IAAO SV&AS, Section 5.4.1, "Sales Involving Government Agencies."
"Sales to government agencies can involve an element of compulsion and often occur at prices
higher than would otherwise be expected. When the governmental agency is the seller, values
typically fall on the low end of the value range. The latter should not be considered in model
calibration or ratio studies unless an analysis indicates governmental sales have affected the
market in specific market areas or neighborhoods. Each sale in this category should be
thoroughly researched prior to use."

IAAO SV&AS, Section 5.4.2, "Sales Involving Charitable, Religious or Educational Institutions."
"A sale to such an organization can involve an element of philanthropy, and a sale by such an
organization can involve a nominal consideration or restrictive covenants. These sales often
involve partial gifts and therefore are generally not representative of market value."

IAAO SV&AS, Section 5.4.7, "Forced Sales Resulting from a Judicial Order."
"These sales should never be considered for model calibration or ratio studies. The seller in
these sales is usually a sheriff, receiver, or other court officer."

                                                               35
Documentation:
Deed itself; no additional documentation required.
If you receive any documentation that indicates the transfer was arm's length, recode the
transfer. Examples of documentation for recoding as qualified arm's length (transfer
code 02):

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that transfer
         was arm's length

    · Attestation from PA or PA staff that transfer was arm's length
    · Documentation showing property was listed (MLS, Co-Star, LoopNet, etc.) and was

         arm's length

                                                               36
                                       Transfer Code 20

Description:
Transfer to or from utility companies

Description Details/Examples/Notes:
Use code 20 when either the grantor or grantee is a utility company.

Reference:

IAAO Assessment Administration page 196- Non- Arm's Length Sales- Such sales should not be used in ratio
studies. Some typical examples include the following:

Sales involving courts, governmental entities, or public utilities. These are generally forced sales, such as
condemnation or tax sales.

While the IAAO standard does not specifically address this topic, some utility providers are
government or public utilities (see reference below for Sales Involving Government Agencies).

IAAO SV&AS, Section 5.4, Sales Generally Considered Invalid.
"The following types of sales are often found to be invalid and can be excluded unless a larger
sample size is needed. If a larger sample size is needed, these sales require verification.

    · Sales involving government agencies..."

IAAO SV&AS, Section 5.4.1, Sales Involving Government Agencies.
"Sales to government agencies can involve an element of compulsion and often occur at prices
higher than would otherwise be expected. When the governmental agency is the seller, values
typically fall on the low end of the value range. The latter should not be considered in model
calibration or ratio studies unless an analysis indicates governmental sales have affected the
market in specific market areas or neighborhoods. Each sale in this category should be
thoroughly researched prior to use. ..."

Documentation:
Deed itself; no additional documentation required.

If you receive any documentation that indicates the transfer was arm's length, recode the
transfer. Examples of documentation for recoding as qualified arm's length (transfer code 02):

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that transfer
         was arm's length

    · Attestation from PA or PA staff that transfer was arm's length
    · Documentation showing property was listed (MLS, Co-Star, LoopNet, etc.) and was

         arm's length

                                       37
                                                    Transfer Code 21

Description:
Contract for Deed; Agreement for Deed (does not include warranty deed associated with seller
financing)

Description Details/Examples/Notes:
Use code 21 when the instrument type is either "Contract for Deed" or "Agreement for Deed."
These are recordings of seller-financed agreements that initially transfer some of the rights of
ownership but not all. Full ownership transfers once the borrower has satisfied the loan. This is
not for "warranty deed" or "special warranty deed" seller-financed transactions.

NOTE: Code 34 is for final recordings (when a warranty deed is given in accordance with a prior
contract for deed or agreement for deed).

NOTE: Legal title to the property does not transfer until the agreement or contract has been
satisfied. However, s. 196.041(1), F.S., states, "Vendees in possession of real estate under
bona fide contracts to purchase...shall be deemed to have...equitable title to said property." A
buyer with equitable title is the "owner" and may also apply for homestead exemption.

Reference:

IAAO SV&AS, Section 3.1 Real Estate Transfer Documents.
"... Land contracts are executory contracts for the purchase of real property under the terms of
which legal title to the property is retained by the seller until such time as all the conditions
stated in the contract have been fulfilled. These contracts are commonly used for the installment
purchase of real property and are often referred to as a contract for deed. The actual deed is not
recorded until the title passes to the buyer upon fulfillment of the contract."

IAAO SV&AS, Section 5.5.1.3 Land Contracts.
"Land contracts (also known as contracts for deeds) and other installment purchase agreements
in which title is not transferred until the contract is fulfilled require careful analysis. Deeds in
fulfillment of a land contract often reflect market conditions several years in the past, and such
dated information should not be considered. Sales data from land contracts also can reflect the
value of the financing arrangements. In such instances, if the transaction is recent, the sale price
should be adjusted for financing, if warranted, and included as a valid transaction...
Because the contract itself often is not recorded, discovery of these sales is difficult until the
deed is finally recorded. The sale then is likely to be too old to be used."

Because of limited rights of ownership transferred under a contract for deed or agreement for
deed, the following IAAO reference is relevant.

IAAO SV&AS, Section 4.2.1, "Interest Transferred."
"A transaction that conveys the full rights of ownership to a property is known as a fee simple transfer. Fee
simple is defined in land ownership as the complete interest in a property, subject only to governmental powers
such as eminent domain. (for further clarification on fee simple definition see IAAO position paper - Setting the
Record Straight on Fee Simple [IAAO 2015]) Transfers that convey less than full interest are rarely usable in
mass appraisal or in ratio studies without adjustments, unless the appraised value and sale price reflect the
same ownership rights. Examples of partial interest transfers include sales involving life estates, fractional
interest, air rights, and mineral rights."

Documentation:
Deed itself; no additional documentation required.

                                                               38
                                           Transfer Codes 30 through 43
Codes 30 through 43 are for non-arm's length sales that are disqualified and excluded from the
Department's annual ratio studies based on documentation.
These appear in the fourth section of the Transfer Code List under the heading:
"DISQUALIFIED Real Property Transfers based on documented evidence"
Codes 30 through 43 require documentation.

                                                               39
                                     Transfer Code 30

Description:

Transfer between relatives or between corporate affiliates (including landlord-tenant)

Description Details/Examples/Notes:

Use code 30 when the grantor and grantee are affiliated. This affiliation includes relatives
(parents, children, aunts, uncles, nephews, nieces, grandparents) and corporations having the
same officers or having a business or landlord-tenant relationship. While transfer code 30 falls
under the heading for disqualification based on documented evidence, if the affiliation is clearly
indicated in the transfer instrument, use code 30 and additional documentation is not required.

Example A: John Hall-Brown sells his single-family residence to Jane Hall-Brown. In this
example, the transfer instrument itself is the documentation because both parties have the
same last name. If the last name is more common (Smith, Johnson, Anderson, for example),
additional verification may be needed to establish a relationship.

Example B: ABC Corporation sells its real property to Mary Smith. The transfer instrument is
signed by Mary Smith, President of ABC Corporation. In this example, the transfer instrument
itself is the documentation.

Example C: Joe Brown sells his commercial office building to XYZ Inc. Nothing within the
transfer instrument indicates Joe and XYZ Inc. are affiliated. A search of the Division of
Corporations website for XYZ Inc. shows Joe is the vice president. The information obtained
from the Division of Corporations is the documentation.

Reference:

IAAO SV&AS, Section 5.4.5, Sales between Relatives or Corporate Affiliates.
"Sales between close relatives (parents, children, aunts, uncles, nephews, nieces,
grandparents) or corporate affiliates are usually non-open-market transactions. If the following
factors apply during the follow-up verification, the sale may be considered a valid transaction.

    · The property was exposed on the open market.
    · The asking and selling price was within the range that any party purchasing the property

         would be expected to pay.
    · The sale meets all other criteria of being an open-market, arm's-length transaction."

IAAO SV&AS, Section 5.5.5 , Leasebacks.
"A leaseback is defined as the sale of a building, land, or other property to a buyer under special
arrangements for simultaneously leasing it on a long-term basis to the original seller, usually
with an option to renew the lease. These transactions are also referred to as sale and leaseback
and sale-leaseback. Leasebacks occur in the commercial and industrial class of property. Sales
involving leasebacks are generally invalid because the sale price is unlikely to represent the
market value of the property. This can be determined only by further verification of the sale (see
Appendix B for questions involving leasebacks)."

                                     40
Documentation:
Typical documentation in support of code 30:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         parties are affiliated

    · Attestation from PA or PA staff that the parties are affiliated
    · Corporate records showing parties are affiliated
    · Public records showing parties are affiliated
If the transfer instrument clearly indicates the affiliation, no additional documentation is required.
If you receive any documentation that indicates the transfer was arm's length, recode the
transfer. Examples of documentation for recoding as qualified arm's length (transfer
code 02):
    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that transfer

         was arm's length
    · Attestation from PA or PA staff that transfer was arm's length

         Documentation showing property was listed (MLS, Co-Star, LoopNet, etc.) and was
         arm's length

                                                               41
                                     Transfer Code 31

Description:

Transfer involving a trade or exchange of land (does not include 1031 exchanges)

Description Details/Examples/Notes:

Use code 31 when documented evidence clearly indicates the transfer was part of a trade.
Often the evidence is another transfer that occurs at the same time between the same parties.

NOTE: If the transfer involved a 1031 exchange that significantly affected the sale price, the
appropriate transfer code would be 37 (atypical motivation).

Reference:

IAAO SV&AS, Section 5.5.1.1, Trades.
"In a trade, the buyer gives the seller one or more items of real or personal property as all or
part of the full consideration. If the sale is a pure trade with the seller receiving no money or
securities, the sale should be excluded from analysis. If the sale involves both money and
traded property, it may be possible to include the sale in the analysis if the value of the traded
property is stipulated, can be estimated with accuracy, or is small in comparison to the total
consideration. However, transactions involving trades should be excluded from the analysis
whenever possible, particularly when the value of the traded property is substantial."

IAAO SV&AS, Section 5.5.3, Internal Revenue Code Section 1031 Exchanges.
"Internal Revenue Code Section 1031 stipulates that investment properties can be sold on a tax-
deferred basis if certain requirements are met. These transactions enable the taxpayer to defer
capital gains tax on the sale of a business use or investment property. All net equity must be
reinvested in a certain time period. A certain amount of undue stimuli may be present as this time
period lapses. Sale transactions that represent Section 1031 exchanges should be analyzed like
any other commercial transaction and, absent conditions that would make the sale price
unrepresentative of market value, should be considered valid sales."

Documentation:

Typical documentation in support of code 31:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer involved a trade or exchange of land

    · Attestation from PA or PA staff that the transfer involved a trade or exchange of land
    · Public records showing transfer involved a trade or exchange of land

                                     42
                                     Transfer Code 32

Description:

Transfer involving an abnormal period of time between contract date and sale date (examples:
pre-construction sales, pre-development sales)

Description Details/Examples/Notes:

Use code 32 when the length of time between the contract date (meeting of the minds) and the
transfer date (the date the transfer instrument is executed) is unusually long and the sale price
is not reasonably indicative of fair market value as of the transfer date.

Example: A contract is signed in April 2014 on a condo unit with an anticipated completion date
of January 2015. Problems arise, and construction is not complete until December 2015, when
all the transfer instruments are executed and recorded. The property appraiser receives
document evidence showing that the contract sale price from April 2014 is substantially different
from the contract sale prices in mid to late 2015.

Reference:

While the IAAO standard does not specifically address this topic, it is appropriate to set these
transactions aside if an abnormal period of time passed between contract date and sale date,
causing the sale price to no longer be reflective of market value. In some cases, the contract
(which may have captured market value at the time) was executed in a prior year, and its use in
a current mass valuation or ratio study would not be appropriate.

IAAO SV&AS, Section 5, Sales Verification.
"Sales should be verified to determine whether they reflect the market value of the real property
transferred. The verification process should be conducted in a manner that is timely, uniform,
and transparent

Specific objectives for sales verification should be documented, and they should include but not
be limited to the following:

    · Sale prices should be adjusted to reflect only the market value of the real property
         transferred net of personal property, financing, or leases.

    · Sales verification should include all sales that occurred during the time frame being tested or modeled.
    · Sales should be invalidated only when they fail to meet the requirements of an open-

         market, arm's-length transaction.

                                     43
Documentation:
Typical documentation in support of code 32:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that an
         abnormal period of time passed between contract date and sale date, causing the sale
         price to no longer be reflective of market value.

    · Attestation from PA or PA staff that an abnormal period of time passed between contract
         date and sale date, causing the sale price to no longer be reflective of market value.

    · Other documentation, such as news articles, information on developer's website, public
         records, etc., showing an abnormal period of time passed between contract date and
         sale date, causing the sale price to no longer be reflective of market value.

                                                               44
                                                    Transfer Code 33
Description:

Transfer that included incomplete or unbuilt common property

Description Details/Examples/Notes:

Sales of condominium units and units in planned unit developments or vacation resorts often
include an interest in common elements (for example, golf courses, clubhouses, or swimming
pools) that may not exist or be usable on the transfer date. A sale price for one of these units
may include an amount that reflects the buyer's expectation of future use of the unbuilt or
incomplete common elements. If the common elements are not completed according to the
timeline expected in the market, later sale prices for these types of units may not reflect any
expectation of having common elements in place and the prior sale prices may no longer be
valid indicators of fair market value. If the property appraiser obtains evidence showing such a
change in buyer expectations after the transfer date, a sale may be disqualified using code 33.
Reference:

IAAO SV&AS, Section 5.5.1.4, Incomplete or Unbuilt Common Property.
"Sales of condominium units and of units in planned unit developments or vacation resorts often
include an interest in common elements (e.g., golf courses, clubhouses, or swimming pools) that
may not exist or be usable on the date of sale or on the assessment date. Sales of such
properties should be examined to determine whether prices might be influenced by promises to
add or complete common elements at some later date. Sales whose prices are influenced by
such promises should be excluded or the sales price should be adjusted to reflect only the value
of the improvements or amenities in existence on the assessment date."

Documentation:

Typical documentation in support of code 33:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer included incomplete or unbuilt common property, which if not completed by the
         assessment date, would cause the sale price not to be reflective of market value.

    · Attestation from PA or PA staff that the transfer included incomplete or unbuilt common
         property, which if not completed by the assessment date, would cause the sale price not
         to be reflective of market value.

    · Other documentation, such as news articles, information on developer's website, public
         records, etc., showing the transfer included incomplete or unbuilt common property,
         which if not completed by the assessment date, would cause the sale price not to be
         reflective of market value.

                                                               45
                                     Transfer Code 34

Description:

Transfer satisfying payment in full of a prior property contract

Description Details/Examples/Notes:

Use code 34 when a transfer instrument is part of a prior contract or agreement. Typically, this
code will apply when a warranty deed is given in accordance with a prior contract for deed or
agreement for deed. In the original contract for deed or agreement for deed, the seller agrees to
give the warranty deed to the buyer once the buyer has completed payments under the
contract/agreement. In these instances, the sale price reflects the amount agreed to be paid at
the time of the initial contract/agreement (which, in many cases, will be several years prior), not
the current fair market value of the property.

In some instances, the transfer instrument will specify that it is being given in satisfaction of the
prior property contract; if this is the case, the transfer instrument itself can be the evidence to
justify using code 34. However, if the transfer instrument does not specifically state this
information, you must obtain another form of evidence.

Example (Correct Use A): A warranty deed was executed in February 2010 between John Doe
and Jim Smith. The following statement appears in the warranty deed: "This deed is being
recorded for the purpose of fulfilling the terms of Agreement for Deed dated February 15, 1995,
recorded in OR Book 1234, Page 987, public records of ANY County, Florida." In this example,
the transfer instrument clearly indicates it is satisfying a prior property contract; the property
appraiser can use the transfer instrument as evidence to justify using code 34.

Example (Correct Use B): A warranty deed was executed in February 2016 between Jane Doe
and Jill Smith. Nothing in the transfer instrument indicates it is satisfying a prior property
contract. The transfer is initially coded 01. In March 2016, Jill Smith returns a sale
questionnaire, deemed reliable, indicating the transfer was executed to fulfill the terms of a
contract for deed, which the two parties had entered in February 1995. In this example, the
questionnaire is the documentation showing that the transfer was in satisfaction of a prior
property contract.

Example (Correct Use C): A warranty deed was executed in February 2016 between José
Perez and Jill Doe. Nothing in the transfer instrument indicates it is satisfying a prior property
contract. This parcel has a prior recording of a warranty deed or contract for deed coded 21
between the same parties. In this example, the prior instrument is the documentation showing
that the transfer was in satisfaction of a prior property contract.

Example (Incorrect Use): A contract for deed was executed in March 2016 between Jill Perez
and Mary Smith for $75,000. This transfer should be coded 21.

NOTE: Legal title to the property does not transfer until the agreement or contract has been
satisfied. However, s. 196.041(1), F.S., states, "Vendees in possession of real estate under
bona fide contracts to purchase...shall be deemed to have...equitable title to said property." A
buyer with equitable title is the owner and may also apply for homestead exemption.

                                     46
Reference:
IAAO SV&AS, Section 3.1, Real Estate Transfer Documents.
"... Land contracts are executory contracts for the purchase of real property under the terms of
which legal title to the property is retained by the seller until such time as all the conditions
stated in the contract have been fulfilled. These contracts are commonly used for the installment
purchase of real property and are often referred to as a contract for deed. The actual deed is not
recorded until the title passes to the buyer upon fulfillment of the contract."
IAAO SV&AS, Section 5.5.1.3, Land Contracts.
"Land contracts (also known as contracts for deeds) and other installment purchase agreements
in which title is not transferred until the contract is fulfilled require careful analysis. Deeds in
fulfillment of a land contract often reflect market conditions several years in the past, and such
dated information should not be considered. Sales data from land contracts also can reflect the
value of the financing arrangements. In such instances, if the transaction is recent, the sale
price should be adjusted for financing, if warranted, and included as a valid transaction....
Because the contract itself often is not recorded, discovery of these sales is difficult until the
deed is finally recorded. The sale then is likely to be too old to be used."
Documentation:
Typical documentation in support of code 34:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer was satisfying payment in full of a prior property contract

    · Attestation from PA or PA staff that the transfer was satisfying payment in full of a prior
         property contract

    · Public records showing the transfer was satisfying payment in full of a prior property
         contract

                                                               47
                                     Transfer Code 35

Description:

Transfer involving atypical amounts of personal property

Description Details/Examples/Notes:

Use code 35 when you obtain documentation showing that the recorded selling price included
atypical amounts of personal property. If documentation shows that the recorded selling price
included the consideration actually paid for personal property and that it caused the combined
total of costs of sale and personal property (as a percentage of the recorded sale price) to be
greater than the percentage adjustment the property appraiser reported on Form DR-493 for the
applicable use code group, then you may consider it to be atypical amounts of personal
property.

NOTE: The documentary stamp tax is the source of recorded selling prices for real property,
and transfers of personal property are not subject to this tax. Therefore, the property appraiser
cannot assume that the recorded selling price for real property included any payment for
transferred personal property. Documented evidence must justify a conclusion that a recorded
selling price included any payment for personal property.

Reference:

Section 193.011, F.S., Factors to consider in deriving just valuation:
In arriving at just valuation as required under s. 4, Art. VII of the State Constitution, the property
appraiser shall take into consideration the following factors: ...
(8) The net proceeds of the sale of the property, as received by the seller, after deduction of all
of the usual and reasonable fees and costs of the sale, including the costs and expenses of
financing, and allowance for unconventional or atypical terms of financing arrangements. When
the net proceeds of the sale of any property are utilized, directly or indirectly, in the
determination of just valuation of realty of the sold parcel or any other parcel under the
provisions of this section, the property appraiser, for the purposes of such determination, shall
exclude any portion of such net proceeds attributable to payments for household furnishings or
other items of personal property.

Real Property Appraisal Guidelines, Sec. 3.0, Important Definitions and Concepts.
"... 3.1.3 Real Property. Section 192.001(12), Florida Statutes, defines real property as: "land,
buildings, fixtures, and all other improvements to land."
"3.1.4 Personal Property. Section 192.001(11), Florida Statutes, defines personal property as
being divided into the following four categories: 1) household goods, 2) intangible personal
property, 3) inventory, and 4) tangible personal property."
Real Property Appraisal Guidelines, Sec. 5.0, "Defining the Mass Appraisal Process," p. 15. ...
"... 5.1 Identification of Real Property. The first step in the appraisal process is to identify the
real property that is to be appraised. Only real property, as defined in section 3.1.3 [see above]
should be included in just valuations of real property. Any personal property, as defined in
section 3.1.4 [see above], should be excluded from just valuations of real property..."

                                     48
Tax Roll Production, Submission, and Evaluation Standards, Section 6, SDF General Data
Requirements.
6.1 All Sales Must Be on the SDF. The SDF must include all transfers of ownership of real
property, meaning all documents that convey title to real property and have a documentary
stamp amount posted by the county clerk's office, including documents that have minimal
documentary stamp amounts of $0.00 or $0.70 ($0.60 in Miami-Dade). For each transfer of
ownership in the previous year, the required data include:

    · Sale price, indicated by the documentary stamps posted on the transfer document
         (Field 8).

    · Sale date (Fields 9 and 10) Note: Data in the Sale Year and Sale Month fields should
         reflect the date of execution (the date the deed was signed, witnessed, and notarized),
         not the recording date. If there are multiple notarization dates, use the latest one.

    · Official record book and page number or clerk instrument number (see Fields 11-13)
    · The basis for qualification or disqualification of the sale (Field 5) ..."

IAAO SV&AS, Section 5, Sales Verification.
"Sales should be verified to determine whether they reflect the market value of the real property
transferred. Specific objectives for sales verification should be documented, and they should
include but not be limited to the following:
· Sale prices should be adjusted to reflect only the market value of the real property
transferred net of personal property, financing, or leases. ..."

IAAO SV&AS, Section 6, Adjustments.
    [NOTE: IAAO guidance calls for adjusting sale prices for the value of personal property
            included in a transaction. DOR requires the sale price to be recorded "as indicated by
            the documentary stamps posted on the transfer document," which does not allow for
            such adjustments (see "Tax Roll Production, Submission, and Evaluation Standards"
            excerpt above). The following excerpt is for informational purposes and does not
            alter the DOR requirement that a given sale price may not be adjusted.]

Sales should be adjusted to represent only the value of the real property as of the assessment date prior to
model calibration and ratio studies. Adjustments to sale price can be a result of factors underlying the
transaction, property conditions at time of sale, and market trends.

The conditions that may require adjustments to the sale price are especially true for
nonresidential properties. The real property tax is based on the market value of real property
alone as of a specific date. This value may not be the same as investment value (i.e., the
monetary value of a property to a particular investor) and does not include the value of personal
property or financing arrangements. ..."

                                                               49
Documentation:
Typical documentation in support of code 35:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer included personal property in the recorded selling price and the amount of the
         sale price attributed to the personal property

    · Attestation from PA or PA staff that the transfer included personal property in the
         recorded selling price and the amount of the sale price attributed to the personal
         property

    · Other documentation, such as news articles, information on buyer's/seller's website,
         MLS, Co-Star, LoopNet, public records, etc., showing the transfer included personal
         property in the recorded selling price and the amount of the sale price attributed to the
         personal property

NOTE: If the documentation shows that the recorded selling price included an atypical amount
of personal property, then the combined amount of personal property and costs of sale (as a
percentage of the recorded selling price) must be greater than the percentage adjustment
reported on Form DR-493 to use code 35.

                                                               50
                                           Transfer Code 36

Description:

Transfer involving atypical costs of sale

Description Details/Examples/Notes:

Use code 36 when the property appraiser obtains documented evidence showing that the
recorded selling price included atypical amounts of costs of sale. If evidence shows that the
actual costs of sale cause the combined total of costs of sale and personal property (as a
percentage of the recorded selling price) to be greater than the percentage adjustment the
property appraiser reported on Form DR-493 for the applicable use code group, then it qualifies
as atypical costs of sale.

NOTE: The documentary stamp tax is the source of recorded selling prices for real property,
and transfers of personal property are not subject to this tax. Therefore, the property appraiser
cannot assume that the recorded selling price for real property included any payment for
transferred personal property. Documented evidence must justify a conclusion that a recorded
selling price included any payment for personal property.

Reference:

Section 193.011, Florida Statutes, Factors to consider in deriving just valuation.
"In arriving at just valuation as required under s. 4, Art. VII of the State Constitution, the property
appraiser shall take into consideration the following factors: ...
"(8) The net proceeds of the sale of the property, as received by the seller, after deduction of
all of the usual and reasonable fees and costs of the sale, including the costs and expenses of
financing, and allowance for unconventional or atypical terms of financing arrangements. When
the net proceeds of the sale of any property are utilized, directly or indirectly, in the
determination of just valuation of realty of the sold parcel or any other parcel under the
provisions of this section, the property appraiser, for the purposes of such determination, shall
exclude any portion of such net proceeds attributable to payments for household furnishings or
other items of personal property."

Tax Roll Production, Submission, and Evaluation Standards, Section 6, SDF General Data
Requirements.
6.1 All Sales Must Be on the SDF. The SDF must include all transfers of ownership of real
property, meaning all documents that convey title to real property and have a
documentary stamp amount posted by the county clerk's office, including documents that
have minimal documentary stamp amounts of $0.00 or $0.70 ($0.60 in Miami-Dade). For
each transfer of ownership in the previous year, the required data include:

    · Sale price, indicated by the documentary stamps posted on the transfer document
         (Field 8).

    · Sale date (Fields 9 and 10) Note: Data in the Sale Year and Sale Month fields
         should reflect the date of execution (the date the deed was signed, witnessed, and
         notarized), not the recording date. If there are multiple notarization dates, use the
         latest one.

                                           51
    · Official record book and page number or clerk instrument number (see Fields 11-13)
    · The basis for qualification or disqualification of the sale (Field 5)

IAAO SV&AS, Section 6, Adjustments.
    [NOTE: IAAO guidance calls for adjusting sale prices for the value of personal property
            included in a transaction. DOR requires the sale price to be recorded "as indicated by
            the documentary stamps posted on the transfer document," which does not allow for
            such adjustments (see "Tax Roll Production, Submission, and Evaluation Standards
            " excerpt above). The following excerpt is for informational purposes and does not
            alter the DOR requirement that a given sale price may not be adjusted.]

Sales should be adjusted to represent only the value of the real property as of the assessment date prior to
model calibration and ratio studies. Adjustments to sale price can be a result of factors underlying the
transaction, property conditions at time of sale, and market trends.

The conditions that may require adjustments to the sale price are especially true for
nonresidential properties. The real property tax is based on the market value of real property
alone as of a specific date. This value may not be the same as investment value (i.e., the
monetary value of a property to a particular investor) and does not include the value of personal
property or financing arrangements. ..."

IAAO SV&AS, Section 6.1.1, Buyer's Closing Costs (Paid by Seller).
"Closing costs are settlement fees and expenses incurred in transferring property ownership
that are paid at the real estate closing. Expenses charged commonly include the following
(these vary among the various jurisdictions and individual transactions).

    · Attorney's fee
    · Costs of recording the deed and mortgage
    · Survey
    · Title insurance
    · State transfer taxes (if any).

These costs do not affect the sale price of the property and no adjustment should be made
when they are paid by the buyer. However, when paid by the seller, the costs should be
deducted from the sale price."

IAAO SV&AS, Section 6.1.3.2, Gift Programs.
"Gift programs are a type of creative financing for qualified residential home buyers by certain
lending institutions that provide the buyer with monies to use as part of a down payment or for
property improvements (e.g., AmeriDream, Inc., Housing Action Resource Trust [HART],
Citizens' Housing and Planning Association [CHAPA] are only a few). These Federal programs
are typically associated with low-value residential properties and are difficult to discover.
Typically, the reported sale price for the property is inflated to include the gift amount (monies
not received by the seller). The sale price should be adjusted to reflect only the sale price of the
real property received by the seller."

                                                               52
IAAO SV&AS, Section 6.1.3.3, Points (Paid by Seller).
"Points may be defined as a percentage of the loan amount (charged by the lender) for making
the money available to the borrower. Lenders often charge points in lieu of a higher interest
rate, sometimes to comply with interest rate ceilings. One point is equal to one percent of the
amount of the loan. Points paid by the buyer (borrower) are part of the down payment and do
not require an adjustment, because the points merely represent prepaid interest. However,
when the seller pays points, the sale price should be adjusted downward by the value of the
points, because the buyer receives a below-market interest rate subsidized by the seller. Under
the market value assumption of informed buyers and sellers, the seller must put the property on
the market at a higher price in order to realize the same amount of money for it."

IAAO SV&AS, Section 6.1.4, Real Estate Commissions.
    [NOTE: IAAO guidance calls for adjusting sale prices for unusual commission, back taxes,
            repair allowances, etc. included in a transaction. DOR requires the sale price to be
            recorded "as indicated by the documentary stamps posted on the transfer document,"
            which does not allow for such adjustments (see "Tax Roll Production, Submission,
            and Evaluation Standards " excerpt above). The following excerpts are for
            informational purposes and do not alter the DOR requirement that a given sale price
            may not be adjusted.]

"The real estate commission is the fee the seller pays to a real estate broker to obtain a buyer
for the property. A knowledgeable seller can avoid the fee by advertising and showing the
property, negotiating with potential buyers, and performing the necessary paperwork. The
commission then represents the cost of such services, and the sale price cannot be expected to
be any more or any less if these services are performed by a real estate broker or by the seller.
Therefore, a real estate commission should not be subtracted from the sale price. The sole
exception to this rule occurs when the buyer agrees to pay the seller's commission, in which
case the amount of the commission is added to the sale price."

IAAO SV&AS, Section 6.2.3, Repair Allowances.
"Sometimes the seller provides a repair allowance to the buyer to cure defects in the property.
In sales ratio studies it is important to match the property assessed with the property sold.
Repair allowances should be deducted from the sale price only if the property was in an
unrepaired state on the appraisal date but sold at a higher price reflecting the value of the
repairs. If the sale occurred before the appraisal date and the repairs were made prior to the
appraisal date, no adjustment should be made. For example, if a property sold for $200,000 with
the seller agreeing to credit the buyer $10,000 for needed repairs at closing and both the sale
and repairs were completed before the appraisal date, no adjustment to the sale is required.
However, if the repairs are not made as of the appraisal date, then the sale price should be
adjusted to $190,000 to reflect the value of the unrepaired property on the appraisal date."

                                                               53
Documentation:
Typical documentation in support of code 36:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer included costs of sale in the recorded selling price and the amount of the sale
         price attributed to the costs of sale

    · Attestation from PA or PA staff that the transfer included costs of sale in the recorded
         selling price and the amount of the sale price attributed to the costs of sale

    · Other documentation, such as news articles, information on buyer's/seller's website,
         MLS, Co-Star, LoopNet, public records, etc., showing the transfer included costs of sale
         in the recorded selling price and the amount of the sale price attributed to the costs of
         sale

NOTE: If the documentation shows that the recorded selling price included atypical cost of sale,
the combined amount of personal property and costs of sale (as a percentage of the recorded
selling price) must be greater than the percentage adjustment reported on Form DR-493 to use
code 36.

                                                               54
                                     Transfer Code 37

Description:

Transfer in which property's market exposure was atypical; transfer involving participants who
were atypically motivated; transfer involving participants who were not knowledgeable or
informed of market conditions or property characteristics

Description Details/Examples/Notes:

Use code 37 when the property appraiser obtains documented evidence showing actual market
exposure was atypical for the property type and/or neighborhood or showing the parties
involved in the transfer were atypically motivated or not knowledgeable or informed of market
conditions or property characteristics.

A property can be exposed to the open market in several ways (Multiple Listing Service (MLS)
with a Realtor, For Sale signs on the property, advertisement in newspapers, listing with
commercial real estate companies such as LoopNet or Co-Star, etc.), and typical exposure can
vary based on property type and/or neighborhood. Simply identifying that the property was not
listed in MLS or some other real estate listing service is not sufficient evidence to justify
disqualifying the transfer as having atypical market exposure.

Verification of the actual (or lack of) market exposure along with PA staff's market-based
attestation to why exposure was not typical would typically suffice for documentation.

Verification with one of the parties involved in the transfer is the most common form of evidence
to show that one of the parties was atypically motivated or that they were not knowledgeable or
informed of current market conditions or property characteristics.
Example (Not Exposed): John Doe sells his vacant land to his neighbor, James Smith. Mr. Doe
returns a sale questionnaire, deemed reliable, stating that he wanted to sell his property and
asked Mr. Smith if he would be interested in purchasing the property. The property was not
exposed to the open market (which is typical for this property type and neighborhood), and other
market participants did not have the opportunity to purchase the property.

Example (Atypical Motivation): ABC Corporation decided in May 2010 to close its business
and dissolve the corporation. Verification with the corporation's president indicated it wanted to
liquidate its assets as quickly as possible, so the single-story office building ABC Corporation
owned was listed for sale at a deeply discounted price. The corporation's motivation to sell was
not typical of the market.

Example (Not Knowledgeable/Informed): Jane Doe purchased a single-family home in June
2010 for $130,000. In August 2010, Jane discovered the home was situated beside a sinkhole.
In a sale questionnaire, deemed reliable, Jane stated that had she known about the sinkhole,
she most likely would not have purchased the home and definitely would not have paid
$130,000.

Reference:

IAAO SV&AS, Section 4.2.4, Method of Marketing.
"Property listed with a real estate broker is the most prevalent method of marketing real
property. Typically, when a comprehensive sales verification questionnaire is completed, no
further verification is required if no factors exist that would require further verification and/or
adjustment. Additional marketing methods are as follows:"

                                     55
    · Auctions
    · For sale by owner (FSBO)
    · Internet
    · Newspaper advertisements
    · Sealed bids
    · Word-of-Mouth.

4.2.4.1 Auction
An auction is a method of marketing and selling real property. Auctions fall into two general
groups: absolute auctions in which the property will sell at any price to the highest bidder and
reserve auctions in which a minimum acceptable bid is set. Verification should be made prior to
including the sale as a valid transaction (see Section 5.5.1). Auction sales are typically more
prevalent in rural areas. The auctioneer is the best contact for verification; then the seller.
Rarely is the buyer able to provide all the necessary information.

4.2.4.2 For Sale by Owner (FSBO)
FSBO marketing may be defined as the process of selling real estate without the representation of a real estate
broker or agent. Sellers may employ the services of a marketing or online listing company or may
actively market their own property. A sale meeting these marketing criteria may be considered
as a potentially valid transaction.

4.2.4.3 Internet
Property that sells on the Internet and meets the criteria of being an open-market, arm's-length
transaction should be included as a valid transaction. Brokerage and realty firms are using the
Internet as an additional method for advertising and marketing their inventory of properties. All
sales require diligent verification. In the case of Internet sales, the primary focus should be
whether the parties to the sale are informed buyers and sellers. Indicators of an uninformed
buyer could include one or more of the following:

         · No knowledge of the market in the area in which the property was purchased
         · No broker/realtor involved
         · No other similar properties in the area examined
         · Bought sight unseen.

4.2.4.4 Newspaper Advertisements
A newspaper advertisement is a method of marketing real property and requires no further
verification if a comprehensive sale's validation questionnaire has been completed and no
factors exist that would require further verification and/or adjustment.

4.2.4.5 Sealed Bids
Verification of sales of properties that are marketed and sold by sealed bids should follow the
guidelines for property that is sold by auction...; it is also important to discover how many bids
were received. If only one bid was offered and no fee appraisal was made on the property, the
sale should not be considered a valid transaction. If a fee appraisal was made on the property

                                                               56
and the bid was within a typical range, the sale may be considered a valid transaction especially
when sample sizes are small.
4.2.4.6 Word-of-Mouth
Word-of-mouth marketing is typically more prevalent in rural areas. This method of marketing
real property requires verification to answer the following questions:

         · How did the buyer discover the property was for sale?
         · How widely was the property marketed?
         · Is word-of-mouth typical exposure for the area?
         · How was the sale price determined?
         · Was a fee appraisal made on the property, and if so, what was the amount?
         · What was the condition of the property at the time of sale?
         · Was the seller actively marketing the property at the time of sale?
Since the buyer would not be able to provide an answer to the majority of these questions, the
seller is the best source of information."
IAAO SV&AS, Section 4.2.5, Time on the Market.
"Sales of properties that have been exposed to the open market too long, not long enough, or
not at all may not represent market value. The jurisdiction should monitor typical marketing time.
The typical marketing time may be longer in a depressed market."
IAAO SV&AS, Section 5.5.1.5, Auction Sales.
"In general, auction sales of real property tend to be at the lower end of the price spectrum and
are more prevalent in rural areas. Absolute auctions do not have a low bid clause or right of
refusal and typically are advertised as absolute auctions. The property is sold to the highest
bidder whatever that bid may be. All absolute auctions should be considered invalid. Before
auction sales should be considered as valid transactions, the following criteria should be met.

         · Was the auction well-advertised?
         · Was the auction well-attended?
         · Did the seller have a minimum bid or the right of refusal on all bids (with reserve)?"

                                                               57
IAAO SV&AS, Section 5.5.4, Adjoining Property Owners.
"Sales in which the buyer already owns adjoining property should be examined carefully to
determine whether or not the buyer possibly paid more or less than the property is worth on the
open market. In some cases, because of the neighbor relationship, the buyer may even receive
a deal on the property. These sales should not be excluded solely because the buyer owns
adjoining property unless one or more of the following reasons exists:

         · Buyer is willing to pay more than the asking price.
         · Buyer is willing to pay more than the fee appraisal.
         · Selling price is substantially less than the asking price.
         · Buyer is under undue stimuli to purchase the adjoining property.
Documentation:
Typical documentation in support of code 37:
Verification (written, verbal) from buyer, seller, or knowledgeable third party of actual (or lack of)
market exposure along with PA staff's market-based attestation to why exposure was not
typical for the property type and/or neighborhood
Verification (written, verbal) from buyer, seller, or knowledgeable third party indicating one or
both participants were atypically motivated to buy/sell the property or one or both participants
were not knowledgeable or informed of market conditions or property characteristics
Attestation from PA or PA staff that the market exposure was atypical for the property type
and/or neighborhood, one or both participants were atypically motivated to buy/sell the
property, or one or both participants were not knowledgeable or informed of market conditions
or property characteristics
NOTE: In addition to any of the above, documentation in the form of a comparable sales
analysis showing subject sale price was not reflective of market value.

                                                               58
                                     Transfer Code 38

Description:

Transfer that was forced or under duress; transfer that was to prevent foreclosure (occurs prior
to date shown in judgment order for public sale)

Description Details/Examples/Notes:

Use code 38 when the property appraiser obtains documented evidence showing that the
transfer was forced, one of the parties was under duress to sell or buy, or the transfer was to
prevent foreclosure. Verification that the property was a short sale or recent lis pendens filings
may be indications of duress; however, if this type of activity dominates the neighborhood or
property type, it may be appropriate to recode as qualified (code 02).

Example (Forced): Joe Smith passed away in January 2014, leaving his single-family
residence to his heirs. In March 2014, the probate judge ordered the property to be sold and the
proceeds to go to the estate. The property sold in June 2014. A search of public records
provides the evidence to show that a court order forced the transfer.

Example (Duress): Jane Smith has had significant health problems over the last few years.
Doctors have told Jane she needs to have full-time care. In August 2015, Jane decided the best
option was to sell her home and move in with her daughter, who lives in another state. Jane
sold her home for $80,000 in September 2015, which was far below selling prices of other sales
in her neighborhood, to expedite the sale. A sale questionnaire describing the situation provides
the documented evidence.

Example (Prevent Foreclosure): Mike Jones has missed several mortgage payments on his
single-family residence. In May 2015, his mortgage company filed a lis pendens, initiating
foreclosure proceedings. Mike listed his home for sale at a price below market, in hopes of a
quick sale and avoiding foreclosure. Mike was unable to bring his mortgage current, so the
mortgage company requested the court to issue an order for sale of the home. The order stated
the home would be sold at public auction on October 1, 2015. Mike was able to sell his house in
September 2015, preventing foreclosure of his home. The lis pendens filing serves as the
documented evidence.

Reference:

IAAO SV&AS, Section 5.4.7, Forced Sales Resulting from a Judicial Order. "These sales
should never be considered for model calibration or ratio studies. The seller in these sales is
usually a sheriff, receiver, or other court officer."

A partition sale is an example. A partition sale is a term used in the law of real property to
describe an act, by a court order or otherwise, to divide a concurrent estate into separate
portions representing the proportionate interests of owners of property. It is sometimes
described as a forced sale. It is often the result of a dissolution of marriage or the division of an
estate among heirs.

                                     59
IAAO SV&AS, Section 5.5.6, Short Sales.
"Short sales are difficult to recognize because the parties to the sale are typical buyers and
sellers. In a short sale, the lien holder agrees to accept a payoff for less than the outstanding
balance of the mortgage or loan. This negotiation is achieved through communication with a
bank's loss mitigation or workout Department. The homeowner or debtor sells the mortgaged
property for less than the outstanding balance of the loan and turns over the proceeds of the
sale to the lender. In such instances, the lender would have the right to approve or disapprove a
proposed sale. Extenuating circumstances influence whether or not banks will discount a loan
balance. These circumstances are usually related to the current real estate market and the
borrower's financial situation. A short sale is typically faster and less expensive than a
foreclosure. A short sale is nothing more than negotiating with lien holders a payoff for less than
what they are owed, or rather a sale of a debt on a piece of real estate short of the full debt
amount. It does not extinguish the remaining balance unless settlement is clearly indicated on
the acceptance of offer. As with all foreclosure-related sales, the element of undue stimuli
exists. Therefore these sales should be treated like other foreclosure-related sales and
considered for model calibration and ratio studies when, in combination with other foreclosure-
related sales, they represent more than 20% of all sales in the market area, but only after a
thorough verification process of each sale. Again, care should be taken when validating these
types of sales to account for changes in property characteristics."

Documentation:
Typical documentation in support of code 38:

              · Verification (written, verbal) from buyer, seller, or knowledgeable third party
                   that the transfer was forced, under duress, or was to prevent foreclosure.

              · Attestation from PA or PA staff that the transfer was forced, under duress, or
                   was to prevent foreclosure.

              · Public records showing order to sell property or foreclosure proceedings
                   started on property (for example, a lis pendens recording).

              · Other documentation, such as news articles, information on buyer's/seller's
                   website, MLS, Co-Star, LoopNet, etc., showing sale was under duress or to
                   prevent foreclosure.

                                                               60
                                     Transfer Code 39

Description:

Transfer in which the consideration paid for real property is verified to be different than the
consideration indicated by documentary stamps

Description Details/Examples/Notes:

Use code 39 when the property appraiser obtains documentation showing that the consideration
paid for the real property is not the same consideration the documentary stamp tax indicates.
Florida law requires the real property sale price the property appraiser reports (to the
Department) to be the sale price the documentary stamp tax on the transfer instrument indicates
(recorded selling price). Based on ss. 192.001(18) and 193.114(2)(n), F.S., and Rule 12D-
8.011(1)(m)4., F.A.C., the Department does not allow the reporting of adjusted sale prices.
Further, the Department allows disqualification of transfers when the two consideration amounts
differ.

If the property appraiser or staff notes a pattern of inaccurately recorded documentary stamp
amounts, the property appraiser should report this to DOR's General Tax Administration at 850-
617-8346.

Example A: A warranty deed is recorded with a documentary stamp amount of $1,750. This
would indicate the consideration paid for the real property was $250,000. The property
appraiser received a reliable sale questionnaire the seller completed, stating the property
actually sold for $225,000. In this example, using an inaccurate sale price of $250,000 to
calculate a ratio would be inaccurate because the data itself is inaccurate. Because the law
requires the price reported to the Department to be the price indicated by the documentary
stamps, the Department cannot use the verified, correct price of $225,000 in its sale ratio study.
However, the county can use the correct price for internal analysis.

Example B: A warranty deed is recorded with a documentary stamp amount of $1,750. This
would indicate the consideration paid for the real property was $250,000. The property
appraiser received a reliable sale questionnaire the seller completed, stating the property
actually sold for $300,000. In this example, using an inaccurate sale price of $250,000 to
calculate a ratio would be inaccurate because the data itself is inaccurate.

Reference:

Section 192.001, Florida Statutes, Definitions.
"(18) `Complete submission of the rolls' includes, but is not limited to, accurate tabular
summaries of valuations as prescribed by Department rule; an electronic copy of the real
property assessment roll including for each parcel total value of improvements, land value, the
recorded selling prices, other ownership transfer data required for an assessment roll under s.
193.114, the value of any improvement made to the parcel in the 12 months preceding the
valuation date, the type and amount of any exemption granted, and such other information as
may be required by Department rule; an accurate tabular summary by property class of any
adjustments made to recorded selling prices or fair market value in arriving at assessed value,
as prescribed by Department rule; an electronic copy of the tangible personal property
assessment roll, including for each entry a unique account number and such other information

                                     61
as may be required by Department rule; and an accurate tabular summary of per-acre land
valuations used for each class of agricultural property in preparing the assessment roll, as
prescribed by Department rule."

Section 193.114, Florida Statutes, Preparation of assessment rolls.
"(2) The real property assessment roll shall include:
(n) The recorded selling price, ownership transfer date, and official record book and page
number or clerk instrument number for each deed or other instrument transferring ownership of
real property and recorded or otherwise discovered during the period beginning 1 year before
the assessment date and up to the date the assessment roll is submitted to the Department.
The assessment roll shall also include the basis for qualification or disqualification of a transfer
as an arms-length transaction. A decision qualifying or disqualifying a transfer of property as an
arms-length transaction must be recorded on the assessment roll within 3 months after the date
that the deed or other transfer instrument is recorded or otherwise discovered. If, subsequent to
the initial decision qualifying or disqualifying a transfer of property, the property appraiser
obtains information indicating that the initial decision should be changed, the property appraiser
may change the qualification decision and, if so, must document the reason for the change in a
manner acceptable to the executive director or the executive director's designee. Sale or
transfer data must be current on all tax rolls submitted to the Department. As used in this
paragraph, the term "ownership transfer date" means the date that the deed or other transfer
instrument is signed and notarized or otherwise executed."

Rule 12D-8.011(1)(m)4., Florida Administrative Code
"(m) The following information shall be gathered and posted for the two most recent transfers of
each parcel. Only information on transfers occurring after December 31, 1976 needs to be
gathered and posted. ...
4. Sales prices as indicated by documentary stamps. ..."

Tax Roll Production, Submission, and Evaluation Standards, Section 6, SDF General Data
Requirements.
6.1 All Sales Must Be on the SDF. The SDF must include all transfers of ownership of real
property, meaning all documents that convey title to real property and have a documentary
stamp amount posted by the county clerk's office, including documents that have minimal
documentary stamp amounts of $0.00 or $0.70 ($0.60 in Miami-Dade). For each transfer of
ownership in the previous year, the required data include:

    · Sale price, indicated by the documentary stamps posted on the transfer document
         (Field 8).

    · Sale date (Fields 9 and 10) Note: Data in the Sale Year and Sale Month fields should
         reflect the date of execution (the date the deed was signed, witnessed, and notarized),
         not the recording date. If there are multiple notarization dates, use the latest one.

    · Official record book and page number or clerk instrument number (see Fields 11-13)
    · The basis for qualification or disqualification of the sale (Field 5)

                                                               62
Documentation:
Typical documentation in support of code 39:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the sale
         price the doc stamps indicate is different from price paid for the property.

    · Attestation from PA or PA staff that the sale price the doc stamps indicate is different
         from price paid for the property.

                                                               63
                                     Transfer Code 40

Description:

Transfer in which the consideration paid for real property is verified to be significantly influenced
by non-market financing or assumption of non-market lease

Description Details/Examples/Notes:

Use code 40 when the property appraiser obtains evidence showing that financing of the
transfer was not typical of the market for that property type and the financing significantly
influenced the price paid for the real property to the point that the price was unrepresentative of
fair market value as of the transfer date.

Also, use code 40 when the property appraiser obtains evidence showing that an existing lease
on the real property was inconsistent with the market rent and assumption of that lease
significantly influenced the price paid for the real property to the point that the price was
unrepresentative of fair market value of the fee simple estate as of the transfer date.

Non-market financing can affect the sale price and could include either below market (favorable)
terms or terms at higher rates than are typical in the market. Non-market financing could include
arrangements like seller-financed sales or installment sale contracts. In considering whether to
use code 40, financing terms to analyze include data on actual and market interest rates, the
amount of the loan, down payment amount, loan type, and the term and amortization provisions
of the loan. If these data points cannot be obtained and verified, it is acceptable to set aside the
sale under code 40.

The mere fact that the seller financed a transaction does not necessarily mean the terms
represent non-market financing. A seller could have financed the transaction at market terms.

Reference:

Tax Roll Production, Submission, and Evaluation Standards, Section 6, SDF
General Data Requirements.

6.1 All Sales Must Be on the SDF. The SDF must include all transfers of ownership of real
property, meaning all documents that convey title to real property and have a documentary
stamp amount posted by the county clerk's office, including documents that have minimal
documentary stamp amounts of $0.00 or $0.70 ($0.60 in Miami-Dade). For each transfer of
ownership in the previous year, the required data include:

    · Sale price, indicated by the documentary stamps posted on the transfer document
         (Field 8).

    · Sale date (Fields 9 and 10) Note: Data in the Sale Year and Sale Month fields should
         reflect the date of execution (the date the deed was signed, witnessed, and notarized),
         not the recording date. If there are multiple notarization dates, use the latest one.

    · Official record book and page number or clerk instrument number (see Fields 11-13)
    · The basis for qualification or disqualification of the sale (Field 5)

                                     64
IAAO SV&AS, Section 5, Sales Verification.
"Sales should be verified to determine whether they reflect the market value of the real property
transferred. The verification process should be conducted in a manner that is timely, uniform,
and transparent.

Principles
 Specific objectives for sales verification should be documented, and they should include but
not be limited to the following:
· Sale prices should be adjusted to reflect only the market value of the real property transferred
net of personal property, financing, or leases. ..."

IAAO SV&AS, Section 6, Adjustments.
    [NOTE: IAAO guidance calls for adjusting sale prices for the value impact of financing on
            the sale price. DOR requires the sale price to be recorded "as indicated by the
            documentary stamps posted on the transfer document," which does not allow for such
            adjustments (see "Tax Roll Production, Submission, and Evaluation Standards"
            excerpt above). The following excerpts are for informational purposes and do not
            alter the DOR requirement that a given sale price may not be adjusted.]

"Sales should be adjusted to represent only the value of the real property as of the assessment
date prior to model calibration and ratio studies. Adjustments to sale price can be a result of
factors underlying the transaction, property conditions at time of sale, and market trends."

The conditions that may require adjustments to the sale price are especially true for nonresidential properties.
The real property tax is based on the market value of real property alone as of a specific date. This value may
not be the same as investment value (i.e., the monetary value of a property to a particular investor) and does
not include the value of personal property or financing arrangements."

IAAO SV&AS, Section 6.2.1, Assumed Long-Term Leases (Nonmarket Rates).
"When a property is encumbered by a lease, the buyer receives the right to the contract rent
stated in the lease. The sale price reflects the relative desirability of this lease. The sale price of
a property encumbered by a long-term lease of at least three years should be adjusted if the
contract rent differs significantly from market rent. The sale price should be adjusted by the
difference between the present worth of the two income streams.
If the contract rent exceeds market rent, the present worth of the difference in the two income
streams should be subtracted from the sale price. ..."

IAAO SV&AS, Section 6.1.3, Financing.
"The market value of property is its most probable selling price in terms of cash or the
equivalent. Sale prices that reflect prevailing market practices and interest rates require no
adjustment for financing. Under such conditions, neither the buyer nor the seller gains any
advantage as a result of the manner of financing; hence, there is no reason for the sale price to
differ significantly from its cash value. Because of different financing arrangements, the sale
price of one property may be different from the sale price of another that is virtually identical. If a
sale is adjusted for atypical financing, this adjustment should be made before any other
adjustments are made. After the sale price has been adjusted for financing, it becomes the
appropriate sale price to use as the basis for further adjustments. Adjustments for financing
require data on actual and market interest rates, the amount of the loan, and the term and
amortization provisions of the loan. Obtaining and properly analyzing such data, as well as
estimating the extent to which the market actually capitalizes nonmarket financing, are difficult
and time-consuming and require specialized skills.
"Typically, new loans from financial institutions are at the prevailing market rates and for seller-

                                                               65
financing, rates can be higher (for a lower sale price) or lower (for a higher sale price). Sales
prices should be adjusted when the rates are above or below market rates. ..."
IAAO SV&AS, Section 6.1.3.4, Seller-Financing (Nonmarket Rates).
"Sales in which the seller and the lender are the same party need to be thoroughly examined to
determine whether the interest rate is the prevailing rate. If it is, no adjustment should be made
for financing In some cases, the seller/lender may accept a low sale price in exchange for a high
rate of interest. In other cases there may be an agreement on a low rate of interest in exchange
for a higher sale price. If the interest rate is above or below the going rate of interest, the
difference in monthly payments required under the going and assumed rates of interest should
be discounted to its present value. This amount should be subtracted from the sale price when
the assumed rate of interest is less than the going rate, and added to the sale price when the
assumed rate exceeds the going rate. The ultimate goal is to bring the sale price up or down to
market. ..."
Documentation:
Typical documentation in support of code 40:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that non-
         market financing or non-market lease assumption significantly influenced the sale price

    · Attestation from PA or PA staff that non-market financing or non-market lease
         assumption significantly influenced the sale price

    · Attestation from PA or PA staff that they cannot verify the terms of non-market financing
         (necessary terms include actual and market interest rates, the amount of the loan, and
         the term and amortization provisions of the loan)

    · Cash equivalency analysis showing non-market financing significantly influenced subject
         sale price

    · Present worth analysis showing non-market lease assumption (contract rent vs market
         rent) significantly influenced subject sale price

    · Other documentation, such as news articles, information on seller's website, etc.,
         showing non-market financing or non-market lease assumption significantly influenced
         the sale price

                                                               66
                                     Transfer Code 41

Description:

Other, including duplicate records; requires documentation and prior approval from DOR

Description Details/Examples/Notes:

Use code 41 when the following conditions exist:

    1) no other qualification code applies;
    2) attempts to verify the transfer were unsuccessful; and
    3) the sale price does not reasonably reflect the fair market value of the sold real property as

       of the transfer date.
                                                                       OR

The deed is an exact duplicate of a prior recorded deed. This is typically an administrative
error by the title company and is not the same as a corrective deed.

NOTE: To use this code, prior approval from the Department is required.

Exact Duplicate Transaction of a Prior Recorded Deed

Any exact duplicate deed may be recorded under code 41. Please note that these are typically
administrative errors or electronic processing errors by the title company and are not the same
as corrective deeds (which should be recorded under code 11). Please maintain a spreadsheet
which includes the original deed and all duplicates. The spreadsheet should include: book/page
or instrument number, parcel ID number, sale price, sale qualification code, date of sale,
grantor, and grantee. Email the spreadsheet to SaleQualification@floridarevenue.com prior to
submitting any SDF. Detailed instructions for use of code 41 are available here.

Reference:
IAAO SV&AS, Section 5, Sales Verification.
"Sales should be verified to determine whether they reflect the market value of the real property
transferred. The verification process should be conducted in a manner that is timely, uniform,
and transparent."

Specific objectives for sales verification should be documented, and they should include but not
be limited to the following:

    · Sale prices should be adjusted to reflect only the market value of the real property
      transferred net of personal property, financing, or leases.

    · Sales verification should include all sales that occurred during the time frame being tested or modeled.
    · Sales should be invalidated only when they fail to meet the requirements of an open-

      market, arm's-length transaction.

"All sales meeting the definition of market value should be included as valid transactions unless
one of the following two conditions exists:

    · Data for the sale are incomplete, unverifiable, or suspect.
    · The sale fails to pass one or more specific tests of acceptability.

                                     67
"Although all sales should normally be verified for use in modeling and appraisal analyses, for
ratio studies a subset of sales can be selected for verification if the verified sales provide a
sufficiently representative sample for purposes of the study (see Standard on Ratio Studies
[IAAO 2013b] for discussion of representative samples).
The position should be taken that all sales are candidates as valid sales unless sufficient
information can be documented to show otherwise. If sales are excluded for ratio studies without
substantiation, the study may appear to be subjective. Reason codes may be established for
valid and invalid sales for both ratio studies and model calibration.
No single set of sales-screening rules or recommendations can be universally applicable for all
uses of sales data or under all conditions. Sales verification guidelines and procedures should
be consistent with the provisions of the value definition applicable to the jurisdiction. Assessors
should use their judgment, but they should not be arbitrary. For uniform judgments, verification
procedures should be in writing. All personnel should be thoroughly familiar with these
procedures as well as with underlying real estate principles (Tomberlin 2001)."

PTO's Tax Roll Production, Submission, and Evaluation Standards, Section 6.3, Real
Property Transfer Codes.

RPTC 41 - Before a property appraiser may use real property transfer code 41 for any
sale, the property appraiser must have approval from the Department. The requirements
for requesting approval to use code 41 are posted on the Department's complete
submission website. For the Department to consider approving a property appraiser's
use of code 41, the property appraiser must send the required documentation to the
Department by March 1 or the next business day for sales reported on the April 1 SDF,
and by June 1 or the next business day for sales reported on the preliminary SDF.

Rehabilitated Properties
The Department received communications from various counties regarding challenges with qualifying
or disqualifying rehabilitated properties for which no construction permits were filed. These properties
were bought and subsequently sold after extensive unpermitted repairs. In many situations, the
properties were sold twice, first at a low price, then again at a much higher price. Without permits, the
extent of work completed is unknown until the subsequent sale. The Department has authorized the
use of real property transfer code 41 for the second sale. As with duplicate deeds, prior approval is
required. When submitting sales for approval, please submit documentation. For more information,
please contact SaleQualification@floridarevenue.com.

Documentation:

Documentation will vary based on the situation. For more complex situations, the full list of
requirements to use this code is available at
https://floridarevenue.com/property/Documents/2025code41req.pdf.

For more simplistic situations (duplicate deed recordings, for example), a memo with deed and
parcel details may suffice. NOTE: For the Department to consider approving a property
appraiser's use of code 41, the property appraiser must send the required documentation to the
Department by March 1, or the next business day, for sales reported on the April 1 SDF and by
June 1, or the next business day, for sales reported on the preliminary SDF.

                                                               68
                                     Transfer Code 42

Description:

Transfer involving mortgage fraud per a law enforcement agency's notification of probable
cause. Transfers involving fraudulent deeds and title theft.

Description Details/Examples/Notes:

A transfer should be coded 42 when the property appraiser obtains documentation from a law
enforcement agency indicating there is probable cause that the transfer involved mortgage
fraud. The Department received communications from various counties concerning increasing
numbers of fraudulent deeds and title theft. Usually, counties are notified by the victims
themselves or by title companies. The Department has authorized the use of real property
transfer code 42 to disqualify these fraudulent transfers.

Reference:

Section 193.133, Florida Statutes, Effect of mortgage fraud on property assessments.
"(1) Upon the finding of probable cause of any person for the crime of mortgage fraud, as
defined in s. 817.545, or any other fraud involving real property that may have artificially inflated
or could artificially inflate the value of property affected by such fraud, the arresting agency shall
promptly notify the property appraiser of the county in which such property or properties are
located of the nature of the alleged fraud and the property or properties affected. If notification
as required in this section would jeopardize or negatively impact a continuing investigation,
notification may be delayed until such time as notice may be made without such effect.
"(2) The property appraiser may adjust the assessment of any affected real property.
"(3) Upon a conviction of fraud as defined in subsection (1), the property appraiser of the
county in which such property or properties are located shall, if necessary, reassess such
property or properties affected by such fraud."

Documentation:

Typical documentation in support of code 42:

    · Notification from arresting agency of probable cause for the crime of mortgage fraud (as
         detailed in s. 193.133, F.S.)

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer was forced, under duress, was to prevent foreclosure, or involved
         fraudulent deeds and title theft

    · Attestation from PA or PA staff that the transfer was forced, under duress, was to
         prevent foreclosure, or involved fraudulent deeds and title theft

    · Public records showing order to sell property, foreclosure proceedings started on
         property, or involved fraudulent deeds and title theft

    · Other documentation, such as news articles, information on buyer's/seller's website,
         MLS, Co-Star, LoopNet, etc., showing sale was under duress, to prevent foreclosure,
         or involved fraudulent deeds and title theft

                                     69
              Transfer Code 43

Description:

Transfer in which the sale price (as the documentary stamps indicate) is verified to be an
allocated price as part of a package or bulk transaction

Description Details/Examples/Notes:

Use code 43 when the property appraiser obtains documented evidence showing that the sale
price the documentary stamps indicate is an allocated price that was part of a package or bulk
transaction.

The two most common scenarios of allocation are: 1) when a single sale price is negotiated for
multiple properties, each property is transferred on its own transfer instrument, and the
documentary stamps reported on each transfer instrument have been divided equally between
all of the transfer instruments or 2) when a single sale price is negotiated for multiple properties,
each property is transferred on its own transfer instrument, and the documentary stamps for the
entire sale price are reported on one transfer document while the others have minimum
documentary stamps. Like multiple-parcel transfers, the true consideration for each property is
unclear.

Example A: Fast Food Inc. has agreed to purchase all Quick Food Corp's properties in the
United States for $80,000,000. Quick Food Corp has 200 properties in all 67 counties in Florida.
Each property is transferred on its own deed, and the documentary stamps recorded on each
indicate a consideration of $400,000. The property appraiser's office verified the transfer with
the CFO of Quick Food Corp, who stated the documentary stamps were divided equally
between the 200 properties but do not necessarily reflect the individual property's sale price.

Example B: Quick Stop Inc. has agreed to purchase all of Shop Fast LLC's convenient stores in
Florida for $2,500,000. Shop Fast LLC has 150 stores in 40 different counties. Each property is
transferred on its own deed. The documentary stamps recorded on one deed indicate a
consideration of $2,500,000, and the other 39 deeds indicate a consideration of $100.
Verification of the transfer with the attorney representing Quick Stop Inc. confirms the
consideration for the bulk purchase was recorded on one deed and the remaining deeds were
recorded with minimum consideration.

Reference:

While the IAAO standard does not specifically address this topic, the following sections
related to multi-parcel transactions are relevant:
IAAO SV&AS, Section 5.5.2, Acquisitions or Divestments by Large Property Owners.

"Acquisitions or divestments by large corporations, pension funds, or real estate investment
trust (REITs) that involve multiple parcels typically should not be considered for analysis."

              70
IAAO SV&AS, Section 5.6.2, Multiple-Parcel Sales.
"A multiple-parcel sale is a transaction involving more than one parcel of real property. These
transactions present special considerations and should be researched and analyzed prior to
being used for valuation or ratio studies.
If the appraiser needs to include multiple-parcel sales, it should be determined whether the
parcels are contiguous and whether the sale is a single economic unit or multiple economic
units. Regardless of whether the parcels are contiguous, any multiple-parcel sale that involves
multiple economic units generally should not be used in valuation or ratio studies. ..."
Documentation:
Typical documentation in support of code 43:

    · Verification (written, verbal) from buyer, seller, or knowledgeable third party that the
         transfer was part of a package or bulk transaction and the recorded selling price is an
         allocated price

    · Attestation from PA or PA staff that the transfer was part of a package or bulk
         transaction and the recorded selling price is an allocated price

    · Other documentation, such as news articles, information on buyer's/seller's website,
         MLS, Co-Star, LoopNet, public records, showing the sale was part of a package or bulk
         transaction and the recorded selling price is an allocated price

                                                               71
                                           Transfer Codes 98 through 99
Description Details/Examples/Notes:
Codes 98 and 99 are for transfers that are pending decision (not yet qualified or disqualified)
and are excluded from the Department's annual ratio studies.
These appear in the fifth section of the Transfer Code List under the heading:
"Real Property Transfers with a PENDING qualification decision"
Section 193.114(2)(n), Florida Statutes, requires sale data to be current on all tax rolls submitted
to the Department and sale qualification decisions to be recorded on the tax roll within three
months after the date that the deed or other transfer instrument is recorded or otherwise
discovered.
Because the sale transfer code field on the SDF should not be blank, the Department
prescribed two codes for use when transfers are reported on the tax roll within the three-month
window for qualification, but the qualification decision has not been made.
Codes 98 and 99 may require additional documentation.

                                                               72
              Transfer Code 98

Description:

Unable to process transfer due to deed or transfer instrument errors (examples: incomplete or
incorrect legal description, incorrect grantor)

Description Details/Examples/Notes:

Use code 98 when the transfer instrument contains errors preventing accurate processing.
Examples include errors such as incomplete or incorrect legal description or the grantor is not
the current owner of record. Once the error has been corrected, update the transfer with the
correct qualification code.

Reference:

Section 193.114, Florida Statutes, Preparation of assessment rolls.
"... (2) The real property assessment roll shall include: ...
(n) The recorded selling price, ownership transfer date, and official record book and page
number or clerk instrument number for each deed or other instrument transferring ownership of
real property and recorded or otherwise discovered during the period beginning 1 year before
the assessment date and up to the date the assessment roll is submitted to the Department.
The assessment roll shall also include the basis for qualification or disqualification of a transfer
as an arms-length transaction. A decision qualifying or disqualifying a transfer of property as an
arms-length transaction must be recorded on the assessment roll within 3 months after the date
that the deed or other transfer instrument is recorded or otherwise discovered. If, subsequent to
the initial decision qualifying or disqualifying a transfer of property, the property appraiser
obtains information indicating that the initial decision should be changed, the property appraiser
may change the qualification decision and, if so, must document the reason for the change in a
manner acceptable to the executive director or the executive director's designee. Sale or
transfer data must be current on all tax rolls submitted to the Department. As used in this
paragraph, the term "ownership transfer date" means the date that the deed or other transfer
instrument is signed and notarized or otherwise executed. ..."

Documentation:

Typical documentation in support of code 98:

    · Deed or instrument itself, plus previous deeds showing a discrepancy
    · Detailed documentation (including contact names, contact numbers/email addresses,

         and dates) of all efforts made to obtain a corrective deed

              73
              Transfer Code 99

Description:

Transfer was recorded or otherwise discovered in the previous 90 days and qualification
decision is pending; invalid for transfers recorded or otherwise discovered more than 90 days
earlier

Description Details/Examples/Notes:

Use code 99 when the transfer is reported on the SDF but occurred within the previous 90 days
and the qualification decision has not been made. Update transfers with the correct transfer
code within 90 days after the date that the deed or other transfer instrument is recorded or
otherwise discovered, and a qualification decision has been made.

Reference:

Section 193.114, Florida Statutes, Preparation of assessment rolls.
"(2) The real property assessment roll shall include:
(n) The recorded selling price, ownership transfer date, and official record book and page
number or clerk instrument number for each deed or other instrument transferring ownership of
real property and recorded or otherwise discovered during the period beginning 1 year before
the assessment date and up to the date the assessment roll is submitted to the Department.
The assessment roll shall also include the basis for qualification or disqualification of a transfer
as an arms-length transaction. A decision qualifying or disqualifying a transfer of property as an
arms-length transaction must be recorded on the assessment roll within 3 months after the date
that the deed or other transfer instrument is recorded or otherwise discovered. If, subsequent to
the initial decision qualifying or disqualifying a transfer of property, the property appraiser
obtains information indicating that the initial decision should be changed, the property appraiser
may change the qualification decision and, if so, must document the reason for the change in a
manner acceptable to the executive director or the executive director's designee. Sale or
transfer data must be current on all tax rolls submitted to the Department. As used in this
paragraph, the term "ownership transfer date" means the date that the deed or other transfer
instrument is signed and notarized or otherwise executed."

Documentation:

Typical documentation in support of code 99:

    · Transfer instrument showing recorded date
    · Other documentation showing date transfer was discovered (if not recorded)

              74
8 Frequently Asked Questions

Below are some of our most frequently asked questions.

    1. Do ALL transfers have to be verified?

Transfers which are qualified or disqualified based on examination of the deed or other real
property transfer instrument do not have to be verified. However, verification (and
documentation of the verification) is required to disqualify a transfer that would be initially
qualified based on examination of the transfer instrument or to qualify a transfer that would be
initially disqualified based on examination of the transfer instrument.

    2. Can a county change a qualification code after submitting a sale data file?

Yes, as long as the county has documented evidence to support the change. It would be
inappropriate not to reflect documentation/information the county received regarding a transfer.

NOTE: The Department does run analysis comparing the April 1 SDF and the July 1 preliminary
SDF and may ask for documentation for changes to coding for deeds that were in the Sale
Qualification Study.

    3. Can a county use its own internal qualification code list?

Counties may use internal coding to identify transfers in different or greater detail than DOR's
codes, as long as the county converts these internal codes to DOR's codes when submitting the
SDF.

    4. Why isn't there a code to disqualify a transfer when the buyer purchases an
         adjacent parcel (assemblage)?

The location of the purchased property does not make the sale non-arm's length; the conditions
of the transfer determine whether the transfer was arm's length.

Following are three examples of a buyer purchasing a parcel that is adjacent to one he or she
already owns and the transfer conditions that could result in the transfer being disqualified.

    A. The two parties were family members, and the seller sold the property for less than he
         would have sold to another individual. This could be affiliation (code 30).

    B. A buyer wanted a property built by her grandfather that was not currently for sale. She
         contacted the owner and offered to purchase the property for an amount significantly
         higher than fair market value. This could be a transfer involving atypical participant
         motivation (code 37).

    C. A seller wanted to get rid of a property quickly because of a financial hardship. He
         contacted several of his neighbors about purchasing the property. One of the neighbors
         agreed to buy the property for an amount significantly below fair market value. This
         could be a transfer under duress (code 38).

                                                               75
"Standard on Verification and Adjustment of Sales," Sec. 5.5.4, "Adjoining Property Owners," p. 22.
"Sales in which the buyer already owns adjoining property should be examined carefully to
determine whether the buyer possibly paid more or less than the property is worth on the open
market. In some cases, because of the neighbor relationship, the buyer may even receive a
deal on the property. These sales should not be excluded solely because the buyer owns
adjoining property unless one or more of the following reasons exists:"

    · Buyer is willing to pay more than the asking price.
    · Buyer is willing to pay more than the fee appraisal.
    · Selling price is substantially less than the asking price.
    · Buyer is under undue stimuli to purchase the adjoining property."
    5. When multiple transfer codes apply, which should take precedence over others?
Multiple transfer codes are commonly applicable to one deed or transfer instrument. The
Department does not have a rule regarding precedence; however, a property appraiser may
have an office policy on the topic that should be followed. An example would be a quit claim
deed that, based on the face of the deed, transfers half interest to a family member. In this case,
transfer codes 11, 16, and 30 could apply. Using any of these codes would be correct and
would not result in any mismatch on the annual Sale Qualification Study (if it were a sampled
deed).

9 Thank You

Thank you for your participation!
If you have any questions regarding sale verification or transfer codes or any comments or
questions regarding this training, please contact SaleQualification@floridarevenue.com.

                                                               76
10 Appendix

Image 2.1.1: Sales Verification Questionnaire

                                                               77
Image 2.1.2: Questions for Specific Situations
                                                               78
Image 2.1.3: Documentation Form
                                                               79
Image 3.2.1: Real Property Transfer Qualification Code List
                                                               80
```
