<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            // Free-form per-user grouping/label (e.g. "Bedroom Shelf", "Office Shelf"). Deliberately a free string,
            // not a separate table, so no group CRUD is needed. The UI filter dedupes from
            // values that already exist per user.
            $table->string('group_name', 100)->nullable()->after('condition');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('group_name');
        });
    }
};
