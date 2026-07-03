import mongoose from 'mongoose';

const cashbackRuleSchema = new mongoose.Schema(
  {
    shopType: {
      type: String,
      enum: ['Independent Store', 'Chain & Brand'],
      required: true,
    },
    minCashback: {
      type: Number,
      required: true,
      min: 0,
    },
    maxCashback: {
      type: Number,
      min: 0,
    },
    priority: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
    }
  },
  {
    timestamps: true,
  }
);

const CashbackRule = mongoose.model('CashbackRule', cashbackRuleSchema);
export default CashbackRule;
