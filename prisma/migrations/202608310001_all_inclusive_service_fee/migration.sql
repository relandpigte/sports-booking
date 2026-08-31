ALTER TYPE "ServiceFeeEntryType" ADD VALUE 'PROCESSING_CREDIT';

CREATE TYPE "ProcessingFeeResponsibility" AS ENUM ('PLAYER', 'BUNAL');

ALTER TABLE "BookingPayment"
ADD COLUMN "processingFeeResponsibility" "ProcessingFeeResponsibility" NOT NULL DEFAULT 'PLAYER';

ALTER TABLE "TrainerPayment"
ADD COLUMN "processingFeeResponsibility" "ProcessingFeeResponsibility" NOT NULL DEFAULT 'PLAYER';

ALTER TABLE "TrainerSession"
ADD COLUMN "processingFeeResponsibility" "ProcessingFeeResponsibility" NOT NULL DEFAULT 'PLAYER';

ALTER TABLE "ServiceFeeSettlement"
ADD COLUMN "processingFee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN "processingFeeResponsibility" "ProcessingFeeResponsibility" NOT NULL DEFAULT 'PLAYER';

ALTER TABLE "TrainerServiceFeeSettlement"
ADD COLUMN "processingFee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN "processingFeeResponsibility" "ProcessingFeeResponsibility" NOT NULL DEFAULT 'PLAYER';
