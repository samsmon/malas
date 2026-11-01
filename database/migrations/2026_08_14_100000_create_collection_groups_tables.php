<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MDList/MangaDex-style custom list: many-to-many, one manga can be in more than one
        // group. Replaces the old approach (collections.group_name, one string per collection), which
        // turned out to be semantically wrong: users need the group as a first-class object (a name, can hold
        // all sorts of manga from their collection), not just a single label per collection.
        Schema::create('collection_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->timestamps();
        });

        // Pure pivot: deliberately NO uuid('id') primary key like the other tables. Eloquent's attach()/
        // syncWithoutDetaching() insert pivot rows through the raw query builder (not through
        // model events), so HasUuids never gets a chance to fill the id column, causing a NOT NULL constraint
        // violation. A composite primary key (collection_group_id, collection_id) is the standard pattern
        // for a pure pivot table, so there is no problem at all.
        Schema::create('collection_group_items', function (Blueprint $table) {
            $table->foreignUuid('collection_group_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('collection_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->primary(['collection_group_id', 'collection_id']);
        });

        Schema::table('collections', function (Blueprint $table) {
            $table->dropColumn('group_name');
        });
    }

    public function down(): void
    {
        Schema::table('collections', function (Blueprint $table) {
            $table->string('group_name', 100)->nullable();
        });

        Schema::dropIfExists('collection_group_items');
        Schema::dropIfExists('collection_groups');
    }
};
