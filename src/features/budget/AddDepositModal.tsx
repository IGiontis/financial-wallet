import { useFormik } from "formik";
import * as Yup from "yup";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText } from "reactstrap";
// Import from your shared types file — adjust the path to match your project
import type { InvestmentGoalWithStats, CreateInvestmentContributionDTO } from "../../shared/types/IndexTypes";

// ─── Internal form values ─────────────────────────────────────────────────────
// date is a string here because <input type="date"> works with "YYYY-MM-DD".
// We convert it to a real Date object on submit before calling onSubmit.

interface DepositFormValues {
  amount: number | "";
  date: string;
  notes: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const validationSchema = Yup.object({
  amount: Yup.number().typeError("Amount must be a number").required("Amount is required").positive("Amount must be greater than 0").max(1_000_000, "Amount is too large"),
  date: Yup.string().required("Date is required"),
  notes: Yup.string().max(200, "Max 200 characters"),
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddDepositModalProps {
  goal: InvestmentGoalWithStats;
  isOpen: boolean;
  onClose: () => void;
  /** Receives a fully typed DTO — date is already a Date object. */
  onSubmit: (data: CreateInvestmentContributionDTO) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

export default function AddDepositModal({ goal, isOpen, onClose, onSubmit }: AddDepositModalProps) {
  const formik = useFormik<DepositFormValues>({
    enableReinitialize: true,
    initialValues: {
      amount: "",
      date: today,
      notes: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const dto: CreateInvestmentContributionDTO = {
          goalId: goal.id,
          amount: values.amount as number,
          contributionType: "deposit",
          date: new Date(values.date),
          notes: values.notes || undefined,
        };
        onSubmit(dto);
        resetForm();
        onClose();
      } catch (err) {
        console.error("AddDepositModal submit error:", err);
      }
    },
  });

  const handleClose = () => {
    formik.resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} toggle={handleClose} size="sm">
      <ModalHeader toggle={handleClose}>
        {goal.icon ?? "💰"} Add deposit — {goal.name}
      </ModalHeader>

      <form onSubmit={formik.handleSubmit} noValidate>
        <ModalBody>
          <FormGroup>
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Amount (USD) *</Label>
            <Input
              type="number"
              name="amount"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={formik.values.amount}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.amount && formik.errors.amount)}
            />
            <FormFeedback>{formik.errors.amount}</FormFeedback>
          </FormGroup>

          <FormGroup>
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Date *</Label>
            <Input
              type="date"
              name="date"
              value={formik.values.date}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.date && formik.errors.date)}
            />
            <FormFeedback>{formik.errors.date}</FormFeedback>
          </FormGroup>

          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Notes</Label>
            <Input
              type="textarea"
              name="notes"
              rows={2}
              placeholder="Optional note (e.g. monthly saving)..."
              value={formik.values.notes}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              invalid={!!(formik.touched.notes && formik.errors.notes)}
            />
            <FormFeedback>{formik.errors.notes}</FormFeedback>
            <FormText style={{ fontSize: 11 }}>{formik.values.notes.length} / 200</FormText>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" color="primary" disabled={formik.isSubmitting || !formik.dirty}>
            Add deposit
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
